# 项目初始审计（最终飞书协同轮次）

审计时间：2026-07-22；基线 SHA：`4a43577`。

## 仓库与部署

- Monorepo：npm workspaces，包含 `apps/web`、`apps/server`、`packages/shared`。
- 前端：React、TypeScript、Vite、React Router、TanStack Query、R3F/Three.js。
- 后端：Express、TypeScript、Zod、飞书官方 Node SDK。
- Production：GitHub `main` 自动部署到现有 Vercel 项目；本轮开始时本地 `main` 与 `origin/main` 一致。
- 工作区仅存在文档行尾状态差异，未丢弃，随后纳入本轮文档更新。

## 已有能力（复用，不重复创建）

- 飞书访问令牌缓存和安全错误：`apps/server/src/providers/feishu-client.ts`。
- 模块化 Mock/Feishu Repository：`apps/server/src/repositories/feishu-bitable-repository.ts`。
- 工单状态机与库存闭环：`packages/shared/src/workflow.ts`、`apps/server/src/services/operations-service.ts`。
- Webhook、challenge、加密、卡片回调：`api/feishu/events.ts` 与 `apps/server/src/services/feishu-callback-*.ts`。
- 官方 WebSocket 长连接：`apps/server/src/feishu-ws.ts`。
- IntentRouter、RAG、Maintenance Agent、豆包回退、多模态安全研判均已有实现与测试。
- 增强版 3D 模型和深色工业 UI 已稳定，禁止回退或替换。

## 本轮发现的缺口

- 卡片仅支持旧接单/暂缓动作，value 含多余字段，缺少版本冲突防护。
- 事件内存防重 Set 无 TTL/容量上限。
- Bitable 创建前未通过搜索接口做精确查重；失败策略缺少前端可见的重试状态。
- 工单对象缺少通知状态、最近同步时间、来源与版本。
- 通讯录解析与模块级集成状态不完整。
- RAG 可搜索内置资料，但缺少受校验的文档导入入口。
- R3F 场景通过 `clock.getElapsedTime()` 间接触发 Three.js Clock 弃用提示。

## 安全边界

- 未读取、记录或提交 `.env`、App Secret、Token、chat_id 或用户隐私。
- `.env.example` 仅保留规范变量名和空值。
- Mock/自动测试结果与真实飞书验证严格区分。
- 本轮未改动 GLB、Blend、3D视觉、飞书既有八个工单字段或 Production 配置。

## 状态术语兼容

OpenAPI 方案中的“待分派 → 待处理 → 处理中 → 待验收 → 已完成 → 已关闭”与项目稳定状态机按以下方式对应：

- 待分派 = 项目现有“待接单”
- 待处理 = 项目现有“已接单”
- 处理中 = 项目现有“检修中”
- 待验收 = 项目现有“待验证”

为避免破坏既有飞书单选字段、网站流程和历史数据，本轮保留现有四个中文状态名称，只新增终态“已关闭”；卡片动作语义与 OpenAPI 方案一致。
