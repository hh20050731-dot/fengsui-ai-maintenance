# 烽燧智守飞书原生协同：隔夜执行报告

执行日期：2026-07-19（Asia/Shanghai）

> 本文记录隔夜开发阶段的执行快照；后续独立复核、修复项和最终质量门禁以 `docs/codex-code-review-report.md` 为准。

## 状态总览

| 类别 | 状态 | 说明 |
| --- | --- | --- |
| 已完成并自动测试 | 完成 | 共享 IntentRouter、网站问答路由、机器人查询、工单卡片、回调、接单、督办、日报、鉴权与脱敏 |
| 已完成但仅本地模拟 | 完成 | 卡片发送、飞书卡片点击、机器人群问答、督办通知、每日简报 |
| 已由 Computer Use 完成 | 未完成 | Windows Computer Use 因无法可靠确认 Chrome URL 被安全运行时终止，未执行桌面输入 |
| 已由内置浏览器完成 | 部分 | 飞书开放平台入口可访问，但重定向到扫码登录；本地网站七问与3D回归通过 |
| 因登录或密钥暂停 | 暂停 | 飞书应用后台、机器人、事件回调、Verification Token、Encrypt Key、chatId |
| 因飞书后台权限暂停 | 待确认 | 权限列表、管理员审批和版本发布无法在未登录时确认 |
| 需要用户明天确认 | 是 | 登录、权限、机器人入群、回调 URL、服务端环境变量、测试版本发布、真实卡片和接单测试 |
| 尚未完成 | 真实联调 | 未发送真实群卡片、未接收真实回调、未触发真实定时任务、未部署 Production |

## Git 基线与保护结果

- 当前分支：`ui/stitch-redesign`。
- 基线提交与稳定标签：`b517b14 feat: use enhanced fan model as default digital twin`，标签 `digital-twin-enhanced-v1` 指向该提交。
- 执行前工作区已有辅助研判未提交改动，因此没有强制创建或切换 `feat/feishu-native-collaboration-v1`，避免破坏或误归属既有改动。
- 未提交、未推送、未合并 main、未创建或移动标签、未部署 Production。
- 增强版 GLB、3D 模型代码、飞书工单字段结构和既有状态机均未改动。

详情见 `docs/development-baseline.md`。

## 已完成的问答链路

统一链路：用户问题 → 前端 API → `IntentRouter` → `OperationsService` → 对应 Repository → `RuleBasedDiagnosisProvider` → 结构化回答。

支持意图：

1. `highest_risk_equipment`
2. `high_risk_equipment_list`
3. `equipment_status`
4. `abnormal_metrics`
5. `pending_work_orders`
6. `spare_part_availability`
7. `maintenance_priority`
8. `diagnosis_reason`
9. `unsupported_or_ambiguous`
10. 兼容原页面入口：`repeated_alerts`

未知或含糊问题不会进入固定1号引风机模板。趋势函数按实际差值判断方向，单元测试确认 `4.2 → 3.1` 为下降 `1.1 mm/s`，`72 → 68` 为下降 `4℃`。

## 飞书卡片与回调

高风险工单在 Repository 创建成功后才触发卡片；卡片发送失败只记录操作日志，不回滚工单。普通风险工单不触发高风险卡片。

卡片包含工单编号、设备名称、设备编号、故障部位、故障类型、风险等级、温度、振动、健康度、故障概率、建议时限和当前状态，提供：

- 确认接单：调用既有状态机完成“待接单 → 已接单”；
- 查看3D定位；
- 查看工单详情；
- 暂缓处理：只登记日志，不绕过状态机。

`POST /api/feishu/events` 已支持：

- 明文或加密 challenge；
- Verification Token 常量时间比较；
- 官方 Node SDK 同算法的 AES-256-CBC Encrypt Key 解密；
- `card.action.trigger`；
- `im.message.receive_v1` 文本消息；
- Repository 操作日志 + 进程内集合的重复事件幂等；
- 日志脱敏，不记录完整回调载荷、Token 或 Secret；
- 接单成功后返回更新卡片，重复接单不会重复推进。

## 自动督办和日报

新增受保护接口：

- `POST /api/jobs/work-order-reminders`
- `POST /api/jobs/daily-operations-brief`

必须使用 `CRON_SECRET`，支持 Bearer 或 `x-cron-secret` 请求头。督办覆盖高风险30分钟未接单、4小时内到期、待验证和已完成；同一工单同一规则通过操作日志幂等。日报覆盖设备状态、高风险设备、今日预警、四类工单状态、低库存备件和明日重点任务。

## 环境变量

新增：`CRON_SECRET`。仍需用户在测试/部署环境配置但不得提交：

- `FEISHU_VERIFICATION_TOKEN`
- `FEISHU_ENCRYPT_KEY`
- `FEISHU_NOTIFICATION_CHAT_ID`
- `FEISHU_OPERATION_LOG_TABLE_ID`（要在 Serverless 多实例间保持回调/督办幂等时需要）
- `CRON_SECRET`

本地 `/api/integration/status` 实际检查结果：

- `requestedMode = feishu`
- `feishuClient = true`
- `workOrders.mode = feishu`
- `workOrders.configured = true`
- 其他未配置业务表继续 Mock
- `robot = 缺少默认会话`
- `callbacks.verificationConfigured = false`
- `callbacks.encryptionConfigured = false`
- `scheduledJobs.configured = false`

该状态只证明本地配置能力判断正确，不代表真实卡片或回调联调成功。

当前 `operationLogs` 能力仍为 Mock，因此同一 Node 实例内的回调幂等和工单状态防重复已验证；若要在 Vercel 多实例间对机器人消息回复和定时督办也保持持久幂等，需要配置 `FEISHU_OPERATION_LOG_TABLE_ID`。

## Computer Use 与内置浏览器

Windows Computer Use 在选定 Chrome 窗口时因无法可靠确认当前 URL 被运行时安全策略终止。之后没有继续桌面输入，也没有尝试绕过。

内置浏览器访问 `https://open.feishu.cn/app` 后进入扫码登录页。没有扫码、没有读取二维码、没有验证码操作，也没有保存含二维码截图。安全裁剪证据：`artifacts/computer-use/blocked-sensitive-step.png`。完整记录：`artifacts/computer-use/session-report.md`。

由于登录阻塞，应用概览、机器人、权限、事件、版本、多维表格和群聊页面均未进入，不能伪造对应截图或配置成功结论。

## 本地模拟产物

- 总报告：`artifacts/feishu/local-simulation-report.md`
- 卡片：`artifacts/feishu/cards/`
- 回调：`artifacts/feishu/callbacks/`
- 七类查询：`artifacts/feishu/query-results/`
- 每日简报：`artifacts/feishu/daily-brief/`
- 本地浏览器截图：`artifacts/feishu/query-results/browser/01.png` 至 `07.png`
- 3D回归截图：`artifacts/feishu/regression/digital-twin-enhanced-v1.png`

全部 JSON 产物标注 `LOCAL SIMULATION — NOT REAL FEISHU CALLBACK`。

## 本地浏览器验证

七个预置问题逐项点击通过，分别显示风险最高设备、高风险清单、1号引风机状态、待处理工单、备件、检修优先级和轴承温升依据，没有出现相同固定模板。

3D页面回归：默认增强模型 v1，模型路径可见，正常运行场景不显示“生成维修工单”，浏览器错误日志为空。没有触发真实飞书工单写入。

## 质量门禁

- `npm run lint`：通过。
- `npm run typecheck`：通过。
- `npm test`：21 个测试文件、83 个测试全部通过。
- `npm run build`：通过；Vite 保留既有大 chunk 警告，没有构建错误。
- `npm run verify:production`：通过；共享 ESM、服务端导入、Vercel Function、`/api/health` 和双版本 GLB 资源通过。
- `git diff --check`：通过，仅有 Git 的 LF/CRLF 提示。

## 主要修改与新增文件

核心代码：

- `packages/shared/src/intent-router.ts`
- `packages/shared/src/diagnosis.ts`
- `packages/shared/src/types.ts`
- `apps/server/src/services/operations-service.ts`
- `apps/server/src/providers/notification-provider.ts`
- `apps/server/src/services/feishu-callback-service.ts`
- `apps/server/src/services/operations-jobs-service.ts`
- `apps/server/src/app.ts`
- `apps/web/src/services/offline-api.ts`

测试：

- `packages/shared/src/intent-router.test.ts`
- `apps/server/src/providers/notification-provider.test.ts`
- `apps/server/src/services/feishu-callback-service.test.ts`
- `apps/server/src/services/operations-jobs-service.test.ts`
- 更新既有 API、Provider、OperationsService 与离线适配器测试。

配置、脚本和文档：

- `.env.example`
- `package.json`
- `scripts/simulate-feishu-collaboration.ts`
- `README.md`
- `docs/development-baseline.md`
- `docs/飞书原生协同_明日手动配置清单.md`
- `artifacts/computer-use/session-report.md`
- `docs/overnight-final-report.md`

## 明天第一步

用户本人登录飞书开放平台，进入现有“烽燧智守”应用，然后按 `docs/飞书原生协同_明日手动配置清单.md` 从机器人能力、最小权限、事件与回调、机器人入群和 chatId 开始。完成测试版本发布前不要改 Production；真实联调时先创建一张新的高风险测试工单，再验证多维表格、群卡片、卡片接单和网站状态同步。
