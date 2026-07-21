# Codex 执行状态

更新时间：2026-07-22（Asia/Shanghai）

## 当前阶段

最终比赛成品的飞书原生工单协同、模块化集成状态与发布前验证。

## 当前基线

- 功能分支：`feat/final-ai-feishu-workflow`
- 基线：`main` / `origin/main` 均为 `4a43577`
- 正式域名：`https://fengsui-ai-maintenance.vercel.app`
- GitHub 与 Vercel Production Branch 均保持 `main`，未创建第二个项目。

## 本轮已完成

- 复用现有 FeishuClient、FeishuBitableRepository、OperationsService、回调运行时和 WebSocket 长连接，没有建立第二套实现。
- 工单创建前按“工单编号”精确查重；远端失败时保留本地工单并标记 `syncStatus=failed`，支持显式重新同步。
- 交互式卡片按状态显示接单、开始处理、提交验收、验收通过、退回处理、生成知识候选和关闭动作。
- 卡片 value 限定为 `action/workOrderId/recordId/expectedStatus/version`；实现 event/message TTL 去重和版本冲突防护。
- 通知消息 ID、通知状态、同步状态、最近同步时间和工单来源进入统一领域对象；普通前端不展示内部 ID。
- 通讯录客户端支持邮箱、手机号和 open_id，并提供安全的负责人解析服务。
- 系统设置按应用凭证、Token、业务表、群、事件、回调、通讯录、豆包、RAG、Agent、多模态分别展示状态。
- RAG 增加受校验的文档导入、切分和检索接口；无结果继续不生成虚构引用。
- 3D 场景不再读取已弃用的 `THREE.Clock/getElapsedTime`，使用帧增量累计，未修改 GLB 或视觉参数。

## 自动验证进度

- `npm run lint`：通过。
- `npm run typecheck`：通过。
- `npm test`：36 个测试文件、175 项通过。
- `npm run build`：通过；`npm run verify:production`：通过。
- `npm run test:e2e`：2 项（维修闭环、3D数字孪生）通过。
- 真实飞书后台权限、真实群卡片与 Production：尚未在本轮执行，不宣称真实联调通过。

## 下一步

1. 分模块提交并推送功能分支，验证 Preview。
2. 仅在 Preview 通过后合并 `main`，等待 Vercel 自动 Production。
3. 验证正式域名、Git SHA、主要接口、3D页面和飞书不可用时的安全降级。

## 人工阻塞

飞书权限/事件/群/通讯录范围、豆包 Key、Aily、妙搭、应用审核发布需要账号管理员完成。详见 `docs/MANUAL_ACTIONS_REQUIRED.md`。
