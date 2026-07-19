# 烽燧智守 AI 大赛最终成品实施总计划

## 基线

- 基线分支：`main`
- 基线提交：`6744c0014c5e9204902703ddf6c1fe18fe25acd8`
- 开发分支：`feat/ai-competition-final-product`
- 正式域名：<https://fengsui-ai-maintenance.vercel.app>
- 保护项：深色工业 UI、飞书真实工单闭环、增强版引风机模型、原模型回退能力、GitHub 与 Vercel 的 `main` 默认分支配置。

## 实施阶段

1. 统一领域模型、12 台设备和 10 个可解释故障案例。
2. 建立本地可运行、可追溯引用的轻量 RAG。
3. 建立受限步骤、可降级、可审计的 Maintenance Agent。
4. 增加 DoubaoProvider 与 RuleBasedFallbackProvider，并提供结构化输出校验。
5. 增加多模态巡检资料上传、校验、演示分析和真实 Provider 适配接口。
6. 保留飞书多维表格、机器人和工单闭环，补齐 Aily 与妙搭人工配置指南。
7. 建立通用多设备 3D 模型注册、LOD、节点映射和安全资源释放。
8. 在现有深色工业 UI 中显性呈现 RAG、Agent、多模态和六大能力映射。
9. 补齐单元、接口、构建、模型、安全、性能和 Production smoke 测试。
10. 生成三种分辨率的比赛截图，以及 DOCX、PDF、PPTX、演讲稿、Q&A 和验收材料。
11. 全部门禁通过后提交、推送、合并 `main`，由 Vercel 自动发布并验证正式域名。

## 真实性边界

- 设备遥测、健康度、风险概率、故障案例和多模态结果均为可复现的比赛演示数据或规则模型结果。
- 飞书工单创建与状态同步仅在凭证和对应多维表格能力有效时执行真实联调。
- 不宣称已接入真实工厂、已达到真实模型准确率或已产生真实经济收益。
- Aily、妙搭、豆包远程模型和平台审批若需人工账户操作，只提供代码适配、配置指南与安全降级。

## 质量门禁

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run verify:production`
- `git diff --check`
- 浏览器三分辨率检查、GLB/LOD/节点检查、DOCX/PDF/PPTX 逐页渲染检查。

