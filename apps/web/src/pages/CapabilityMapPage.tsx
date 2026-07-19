import { Bot, Boxes, BriefcaseBusiness, Eye, GitBranch, Presentation } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { IndustrialPanel } from '../components/industrial';
import { PageHeader } from '../components/PageHeader';
import { DemoDisclaimer } from '../components/ui';
import '../styles/capability-map.css';

const capabilities = [
  { title: 'AI算法基础', icon: Bot, route: '/ai', feature: '意图路由、可解释健康评分、RAG、Agent、多模态、结构化输出与失败降级', technology: 'Zod结构化契约 · 轻量语义检索 · 豆包Provider · 规则Fallback', proof: '辅助研判页：引用证据、Agent工具步骤、Provider状态、多模态结果', demo: '询问轴承温升原因 → 检索证据 → 运行Agent' },
  { title: 'AI工具链应用', icon: Boxes, route: '/settings', feature: '飞书多维表格、机器人、WebSocket、卡片回调、Aily与妙搭配置契约', technology: '飞书开放平台 SDK · 多维表格Repository · 事件幂等', proof: '系统设置与飞书集成状态；docs/Aily配置指南.md', demo: '创建工单 → 飞书同步 → 机器人通知' },
  { title: '工程落地能力', icon: GitBranch, route: '/digital-twin', feature: 'Monorepo、统一领域模型、适配器、离线演示、3D LOD、测试与部署回滚', technology: 'React · TypeScript · Express · R3F · Vercel', proof: '本地/生产构建、GLB节点验证、全链路自动测试', demo: '切换设备模型与LOD → 断网演示 → 工单闭环' },
  { title: '产品思维', icon: BriefcaseBusiness, route: '/work-orders', feature: '四类用户、预警到工单再到知识沉淀的完整旅程、敏感操作人工确认', technology: '状态机 · 幂等键 · 模块化能力降级', proof: '工单轨道、备件联动、维修验证与知识候选', demo: '待接单 → 检修中 → 待验证 → 已完成' },
  { title: '业务洞察力', icon: Eye, route: '/', feature: '垃圾焚烧关键设备、工况自适应基线、多参数风险贡献与10类故障案例', technology: '工程规则 · 趋势变化率 · 持续时间 · 多参数融合', proof: '12台设备拓扑、设备详情趋势与风险贡献', demo: '高负荷引风机振动/温度持续上升 → 二级预警' },
  { title: '表达展示能力', icon: Presentation, route: '/knowledge', feature: '故事化Demo、证据截图、项目报告、路演PPT、讲稿、Q&A与真实性说明', technology: '自动截图 · 可追溯交付物 · 数据边界', proof: 'deliverables/ 交付目录与知识库来源', demo: '3–5分钟完整故事线与现场答辩' },
] as const;

const flow = ['设备数据', '工况识别', '健康评估', '风险预警', 'RAG检索', 'Agent编排', '3D定位', '飞书工单', '维修验证', '知识沉淀'];

export function CapabilityMapPage() {
  const navigate = useNavigate();
  return <div className="capability-map-page">
    <PageHeader title="六大核心技能映射" description="每项能力对应真实功能、关键技术、证明位置与可执行Demo步骤" />
    <DemoDisclaimer compact />
    <IndustrialPanel title="业务闭环" meta="AI不只聊天，而是进入设备、知识、库存和工单工具链" className="mt-4">
      <div className="capability-flow">{flow.map((item, index) => <div key={item}><span className="industrial-data">{String(index + 1).padStart(2, '0')}</span><strong>{item}</strong>{index < flow.length - 1 && <i />}</div>)}</div>
    </IndustrialPanel>
    <div className="capability-grid mt-4">{capabilities.map(({ title, icon: Icon, route, feature, technology, proof, demo }, index) => <button key={title} className="capability-card industrial-panel" onClick={() => navigate(route)}>
      <header><span className="industrial-data">0{index + 1}</span><Icon size={19} /><h2>{title}</h2></header>
      <dl><div><dt>具体功能</dt><dd>{feature}</dd></div><div><dt>关键技术</dt><dd>{technology}</dd></div><div><dt>证明位置</dt><dd>{proof}</dd></div><div><dt>Demo步骤</dt><dd>{demo}</dd></div></dl>
      <footer>进入证明页面 <span>→</span></footer>
    </button>)}</div>
    <div className="capability-boundary mt-4"><strong>真实性边界</strong><p>设备、遥测、故障概率、健康度和规则匹配度为可复现比赛演示数据；飞书工单在配置完整并真实联调时使用飞书接口。未配置豆包、多模态、Aily或妙搭后台时自动安全降级，不宣称已完成真实工业模型训练或生产部署。</p></div>
  </div>;
}
