import { randomUUID } from 'node:crypto';
import type { MultimodalInspection } from '@fengsui/shared';
import type { z } from 'zod';
import type { multimodalInspectionRequestSchema } from '@fengsui/shared';
import { AppError } from '../middleware/errors.js';
import type { DataRepository } from '../repositories/data-repository.js';
import type { RagRepository } from './rag-service.js';

type InspectionInput = z.infer<typeof multimodalInspectionRequestSchema>;

const mediaHints: Record<InspectionInput['mediaType'], { observation: string; regions: string[]; targets: string[] }> = {
  现场照片: { observation: '已接收设备现场照片；本地演示模式仅校验图像与关联设备，不对不可见细节作确定判断。', regions: ['设备外观与连接部位', '防护罩和基础紧固区域'], targets: ['外观损伤', '松动、积灰和渗漏痕迹'] },
  仪表照片: { observation: '已接收仪表照片；建议人工复核量程、单位和指针/数字读数。', regions: ['仪表显示区', '量程与单位标识'], targets: ['读数与遥测一致性', '仪表完好性'] },
  泄漏照片: { observation: '已接收疑似泄漏照片；本地演示模式不自动判定介质与泄漏等级。', regions: ['密封面与法兰连接处', '设备下方积液区域'], targets: ['确认介质来源', '检查机械密封和连接紧固'] },
  振动频谱截图: { observation: '已接收振动频谱截图；建议人工确认频率轴、幅值单位与采样工况。', regions: ['1X/2X转频附近', '高频轴承特征区域'], targets: ['转子不平衡特征', '联轴器不对中或轴承冲击特征'] },
  温度趋势截图: { observation: '已接收温度趋势截图；系统将其与当前遥测温升方向共同展示。', regions: ['持续上升区段', '工况切换时间点'], targets: ['传感器一致性', '润滑、负荷和冷却条件'] },
};

export class MultimodalInspectionService {
  constructor(private readonly repository: DataRepository, private readonly rag: RagRepository) {}

  async analyze(input: InspectionInput): Promise<MultimodalInspection> {
    const expectedPrefix = `data:${input.mimeType};base64,`;
    if (!input.dataUrl.startsWith(expectedPrefix)) throw new AppError(400, 'MEDIA_SIGNATURE_MISMATCH', '文件类型与图像内容声明不一致');
    const base64 = input.dataUrl.slice(expectedPrefix.length);
    if (!/^[A-Za-z0-9+/=]+$/.test(base64)) throw new AppError(400, 'INVALID_IMAGE_DATA', '图像数据格式无效');
    const actualSize = Buffer.byteLength(base64, 'base64');
    if (actualSize === 0 || actualSize > 8 * 1024 * 1024) throw new AppError(413, 'IMAGE_TOO_LARGE', '图像不得超过8MB');
    const device = await this.repository.getEquipment(input.deviceId);
    if (!device) throw new AppError(404, 'DEVICE_NOT_FOUND', '未找到关联设备');
    const telemetry = await this.repository.getTelemetry(input.deviceId);
    const latest = telemetry.at(-1);
    const rag = await this.rag.search({ query: `${device.deviceName} ${input.mediaType} ${device.riskLevel}`, deviceType: device.deviceType, limit: 3 });
    const hint = mediaHints[input.mediaType];
    const highRisk = ['二级预警', '高风险'].includes(device.riskLevel);
    return {
      inspectionId: `MM-${randomUUID()}`,
      deviceId: device.deviceId,
      fileName: input.fileName,
      mediaType: input.mediaType,
      mimeType: input.mimeType,
      size: actualSize,
      observationSummary: hint.observation,
      suspiciousRegions: hint.regions,
      telemetryCorrelation: [
        `当前工况：${device.operatingCondition}`,
        `健康度：${device.healthScore}/100，风险等级：${device.riskLevel}`,
        latest ? `最新遥测：振动${latest.vibration} mm/s、温度${latest.temperature}℃、电流${latest.current} A` : '当前无可用遥测点',
      ],
      ragCitations: rag.citations,
      riskLevel: device.riskLevel === '高风险' ? '严重' : device.riskLevel === '二级预警' ? '预警' : device.riskLevel === '关注' ? '关注' : '正常',
      manualInspectionTargets: hint.targets,
      recommendWorkOrder: highRisk,
      limitations: ['图像分析仅用于辅助研判，不能替代现场检测和专业人员判断。', '当前未配置真实多模态模型时使用本地演示关联逻辑，不声称已识别具体缺陷。'],
      provider: 'LocalDemonstrationInspectionProvider',
      createdAt: new Date().toISOString(),
    };
  }
}
