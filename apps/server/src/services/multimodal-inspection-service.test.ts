import { describe, expect, it } from 'vitest';
import { multimodalInspectionRequestSchema } from '@fengsui/shared';
import { MockRepository } from '../repositories/mock-repository.js';
import { LocalRagService } from './rag-service.js';
import { MultimodalInspectionService } from './multimodal-inspection-service.js';

describe('MultimodalInspectionService', () => {
  const repository = new MockRepository();
  const service = new MultimodalInspectionService(repository, new LocalRagService(repository));

  it('校验并生成带边界和遥测关联的演示研判', async () => {
    const input = multimodalInspectionRequestSchema.parse({ deviceId: 'IDF-001', fileName: 'bearing.png', mediaType: '温度趋势截图', mimeType: 'image/png', size: 8, dataUrl: `data:image/png;base64,${Buffer.from('png-demo').toString('base64')}` });
    const result = await service.analyze(input);
    expect(result.provider).toBe('LocalDemonstrationInspectionProvider');
    expect(result.telemetryCorrelation.join(' ')).toContain('健康度');
    expect(result.limitations.join(' ')).toContain('不能替代现场检测');
  });

  it('拒绝不支持的文件类型和超大文件', () => {
    expect(() => multimodalInspectionRequestSchema.parse({ deviceId: 'IDF-001', fileName: 'x.svg', mediaType: '现场照片', mimeType: 'image/svg+xml', size: 5, dataUrl: 'data:image/svg+xml;base64,AAAA' })).toThrow();
    expect(() => multimodalInspectionRequestSchema.parse({ deviceId: 'IDF-001', fileName: 'x.png', mediaType: '现场照片', mimeType: 'image/png', size: 9 * 1024 * 1024, dataUrl: 'data:image/png;base64,AAAA' })).toThrow();
  });
});
