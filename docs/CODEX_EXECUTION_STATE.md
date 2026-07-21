# Codex 执行状态

更新时间：2026-07-22（Asia/Shanghai）

## 当前阶段

最终比赛成品已经完成代码收口、自动化验证、`main` 合并与 Vercel Production 发布。后续仅剩需要账号管理员在飞书后台完成的人工验收事项。

## 当前基线

- 当前分支：`main`
- 功能发布基线：`9b936cd`（最终状态文档提交前）
- 正式域名：`https://fengsui-ai-maintenance.vercel.app`
- GitHub 默认分支与 Vercel Production Branch 均为 `main`
- 未创建第二个 Vercel 项目，未移动稳定标签

## 已完成

- 飞书多维表格工单：按“工单编号”精确查重、优先使用 `recordId` 更新、失败状态保留及显式重试。
- 交互式工单卡片：按状态提供接单、开始处理、提交验收、验收通过、退回处理、生成知识候选和关闭动作。
- 飞书事件与消息：Webhook 与本地 WebSocket 共用意图路由、状态机和卡片动作服务，并实现事件、消息和业务版本幂等。
- 通讯录映射：支持邮箱、手机号和 `open_id` 的安全负责人解析；不在日志或页面泄露标识信息。
- 模块化降级：各飞书业务能力独立判断，维修工单已配置时不会因其他表缺失而整体降级。
- RAG：支持受校验文档导入、切分、检索和来源引用；无证据时不生成虚构引用。
- Maintenance Agent、豆包 Provider 回退和多模态输入保持原有业务边界，并补充状态与自动化验证。
- 3D 数字孪生消除已弃用的 `THREE.Clock/getElapsedTime` 读取，GLB 文件与视觉参数未改动。

## 自动验证

- `npm run lint`：通过。
- `npm run typecheck`：通过。
- `npm test`：36 个测试文件、175 项测试通过。
- `npm run build`：通过。
- `npm run verify:production`：通过。
- `npm run test:e2e`：2 项端到端测试通过（1号引风机维修闭环、3D 数字孪生）。
- `git diff --check`：通过。

## Production 验证

- Vercel Production：Ready。
- 正式域名首页与 `/digital-twin`：HTTP 200。
- 原始和增强版 GLB：均可通过正式域名访问。
- `/api/health`：返回成功，并报告 `mode=feishu`。
- `/api/integration/status`：报告维修工单能力为 `feishu` 且可用。

上述状态证明 Production 配置可完成飞书客户端鉴权探测与工单能力初始化；本轮没有新建真实工单、向真实群发送卡片或点击真实卡片回调，因此不将这些人工动作宣称为已完成真实联调。

## 需要用户完成

飞书后台权限、事件订阅、机器人入群、通讯录可见范围、真实卡片及工单闭环验收，以及豆包等可选密钥配置，请按 `docs/MANUAL_ACTIONS_REQUIRED.md` 执行。文档不包含任何真实密钥。
