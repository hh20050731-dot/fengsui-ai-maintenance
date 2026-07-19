# 烽燧智守未提交改动独立代码审查报告

审查日期：2026-07-19（Asia/Shanghai）

项目目录：`C:\Users\Fture\Documents\飞书Ai`

审查基线：`b517b14`（标签 `digital-twin-enhanced-v1`）

当前分支：`ui/stitch-redesign`

## 1. 执行摘要

最终结论：**B. 有条件审核**。

- 审查发现：P0 1 项、P1 5 项、P2 12 项、P3 4 项。
- 已自动修复全部已确认的 P0、3 项确定性 P1 和 8 项范围清晰的 P2。
- 当前没有已知可直接绕过认证的 P0；六项质量门禁全部通过。
- 仍有 2 项 P1 与 3 项 P2 依赖真实飞书/多实例环境验证或持久协调能力，不能用本地 Mock 证明通过。
- 未部署、未推送、未提交、未合并、未创建/移动标签、未修改 3D 模型和 UI 视觉设计。

## 2. 审查范围

审查了从 `b517b14` 到当前工作区的全部跟踪改动和未跟踪文件，包括：

- 共享 IntentRouter、规则诊断和类型/Schema；
- 网站辅助研判 API、离线适配器和前端问答链路；
- 飞书客户端、机器人卡片、事件/卡片回调、群内查询；
- OperationsService、工单状态机调用、Repository 标识映射；
- 自动督办、日报、CRON 鉴权；
- `.env.example`、README、配置指南、隔夜报告、模拟脚本；
- 所有新增与修改测试；
- `artifacts/` 中的本地模拟、浏览器截图和 Computer Use 证据。

审查前证据位于 `artifacts/code-review/pre-review-*`。没有读取被忽略的真实 `.env` 内容。

## 3. 基线与当前状态

- 基线提交和稳定标签均指向 `b517b149b25f`。
- 审查开始时分支为 `ui/stitch-redesign`，未切换分支。
- 工作区原有大量昨夜改动；审查修复直接保留在工作区供用户检查。
- `apps/server/.env` 被忽略，未纳入差异或审查产物。
- 当前精确状态和差异统计见：
  - `artifacts/code-review/final-status.txt`
  - `artifacts/code-review/final-diff-stat.txt`

## 4. P0 问题

| 编号 | 文件/行 | 触发条件与影响 | 修复方式 | 状态与验证 |
| --- | --- | --- | --- | --- |
| P0-01 | `apps/server/src/services/feishu-callback-service.ts:33,150-162` | 昨夜实现中，期望 Verification Token 未配置时比较函数会返回真，导致回调端点可能 fail-open，未知来源可通过认证。 | `safeSecretEqual()` 在 expected 缺失时返回 false；回调端点未配置 Token 时直接 503；challenge 同样先认证后响应。 | **已修复**。无 Token、错误 Token、未配置 Token、明文 challenge 测试通过。 |

当前未剩余 P0。

## 5. P1 问题

| 编号 | 文件/行 | 触发条件与影响 | 修复方式 | 状态与验证 |
| --- | --- | --- | --- | --- |
| P1-01 | `apps/server/src/providers/notification-provider.ts:29-101`；`feishu-callback-service.ts:65-70` | 原卡片为旧版结构，而回调使用新版 `card.action.trigger`/raw update；本地对象测试可能通过，但真实飞书可能返回卡片格式错误。 | 全部告警、工单、文本卡片迁移到 JSON 2.0；按钮使用 behaviors callback/open_url；raw update data 保持 2.0。 | **已修复**。结构测试通过；真实渲染仍需租户验证。 |
| P1-02 | `apps/server/src/providers/feishu-client.ts:35-50` | tenant token 在服务端缓存但失效后不刷新，会导致所有飞书请求持续失败。 | 遇到 HTTP 401 或官方错误码 `99991663` 时清缓存并只重试一次，避免无限循环。 | **已修复**。刷新成功与二次失败测试通过。 |
| P1-03 | `apps/server/src/services/operations-service.ts:90-105,130-155` | Serverless 实例回收后仅进程内 idempotency 丢失；同一告警的顺序重试可能重复建工单并重复发卡片。 | 从 alert ID 推导稳定工单编号；创建前先查询 Repository；已存在即返回且不再次发卡片。 | **已修复顺序重试/实例重启场景**。进程重建测试通过。 |
| P1-04 | `operations-service.ts:90-105`；`feishu-callback-service.ts:197-230` | 两个 Vercel 实例在同一毫秒并发创建/接单时，进程锁不跨实例；当前 8 个既有工单字段没有唯一约束/CAS。可能重复创建或两人都收到成功。 | 已加入稳定编号、创建前远端查重、单实例按工单锁和状态重读；未改变既有 Bitable 字段。 | **REQUIRES REAL FEISHU VALIDATION**。完全跨实例原子化需要持久唯一约束、外部锁或官方可用的条件更新能力；本轮安全限制下未伪造解决。 |
| P1-05 | `apps/server/src/services/feishu-callback-service.ts:149-187,212-230` | 飞书要求卡片回调约 3 秒内响应；当前接单路径同步等待 Bitable 读取、状态更新和日志，真实网络慢时可能超时。 | 已优先使用卡片内 recordId/稳定标识并减少不必要全表查询；保持失败可见。 | **REQUIRES REAL FEISHU VALIDATION**。本地无法证明真实 Bitable/Function 冷启动延迟满足 3 秒。 |

## 6. P2 问题

| 编号 | 文件/行 | 触发条件与影响 | 修复方式 | 状态与验证 |
| --- | --- | --- | --- | --- |
| P2-01 | `apps/server/src/middleware/errors.ts:12-16` | 非法 JSON 原先进入 500。 | 识别 body-parser parse error，返回 400 `INVALID_JSON`。 | 已修复；接口测试通过。 |
| P2-02 | `apps/server/src/config/env.ts:4-7,23` | `.env.example` 的空 `CRON_SECRET=` 会被 min(16) 拒绝，导致服务无法启动。 | 空字符串预处理为 undefined，非空仍校验最短长度。 | 已修复；配置测试通过。 |
| P2-03 | `feishu-callback-service.ts:39-58,246-272` | 群消息包含 @ 标签、机器人自消息或重复 message_id 时会路由错误/循环回复。 | 移除 mentions key，忽略 app/bot sender，以 message_id 幂等。 | 已修复；真实形状事件测试通过。 |
| P2-04 | `feishu-callback-service.ts:59-65,174-183` | 操作人曾使用固定文本，无法追溯可信来源。 | 从 event.operator 可信字段生成不可逆摘要标签，不信任按钮 value 内用户字段。 | 已修复；并发接单测试断言摘要操作人。 |
| P2-05 | `operations-jobs-service.ts:20-36,81-102` | 临期规则未包含逾期、发送失败也写成功幂等标记、已完成长期重复提醒。 | 区分临期/逾期；失败日志不阻止重试；完成仅提醒 24 小时内。 | 已修复；失败重试和规则测试通过。 |
| P2-06 | `operations-jobs-service.ts:6-7,67-76,105-158` | 日报时区和“今日”边界不明确，待接单与所有未完成混淆，缺少今日完成/临期逾期，当日可重复发送。 | 固定 `Asia/Shanghai`；重算上海日界；按状态统计；成功日报按日幂等。 | 已修复；空数据、跨口径和重复日报测试通过。 |
| P2-07 | `packages/shared/src/intent-router.ts:52-56` | 设备详情页的“当前设备/主要风险”等通用提问无法识别，即使已选择设备。 | 路由接受 selectedDeviceId 并支持页面上下文。 | 已修复；网站与离线适配器共用测试通过。 |
| P2-08 | `packages/shared/src/diagnosis.ts:77-87` | 相等趋势会被写成上升/下降，造成证据方向错误。 | 增加容差并输出“基本稳定”。 | 已修复；上升、下降、相等五项断言通过。 |
| P2-09 | `notification-provider.ts:70-77` | 工单卡片链接使用页面不支持的参数或错误工单路径。 | 3D 改用 `equipment/fault/model`；详情改用 `/work-orders/:workOrderNo`。 | 已修复；卡片 URL 测试和浏览器路由验证通过。 |
| P2-10 | `notification-provider.ts:149-156`；`operations-service.ts:138-154` | messageId 仅返回并写操作日志；OperationLogs 未持久配置时，实例重启后无法主动更新旧卡片。 | 发送失败不回滚工单，返回 messageId；文档明确 OperationLogs 需求。 | **REQUIRES REAL FEISHU VALIDATION / 未完全自动修复**。既有 8 字段限制下未新增字段。 |
| P2-11 | `feishu-callback-service.ts:73-119`；`operations-jobs-service.ts:85-99` | 幂等日志在 `operationLogs` 能力为 Mock 时只在单实例有效。 | 进程内 in-flight/memory 防重 + 可选 Repository 日志；读取/写入失败安全降级并明确日志。 | **未完全自动修复**。生产跨实例需配置 `FEISHU_OPERATION_LOG_TABLE_ID`。 |
| P2-12 | `feishu-callback-service.ts:59-65,212-245` | 当前只确认操作者来自可信字段，没有基于组织角色/工单负责人授权；群内成员都可能点击。 | 不再信任按钮传来的身份，文档标明生产细粒度授权要求。 | **未自动扩权/改业务**。需要真实组织权限方案确认。 |

测试夹具真实性、通知失败、错误 Encrypt Key、并发接单、机器人循环、空日报等缺口已补齐，计入对应问题的修复验证，不另重复计数。

## 7. P3 建议

| 编号 | 位置 | 建议 | 状态 |
| --- | --- | --- | --- |
| P3-01 | `app.ts`、`operations-service.ts` | 路由和业务方法较长，中文动作字符串分散；后续可在稳定后提取常量/控制器。 | 仅记录，避免本轮大重构。 |
| P3-02 | 生产构建 | `DigitalTwinPage` 约 1 MB，Vite 给出 500 kB 分块警告。 | 既有 3D 依赖警告；不阻断。 |
| P3-03 | `.env.example` | `VITE_ENABLE_ENHANCED_MODEL` 当前未被源码读取，说明与默认增强模型行为已有历史偏差。 | 仅记录；本轮不改 3D 配置。 |
| P3-04 | 飞书协议适配 | 手写协议层可工作，但后续升级可优先使用官方 SDK 的事件分发/加解密能力，减少协议漂移。 | 仅建议，不引入依赖。 |

## 8. 已自动修复

1. 回调未配置 Verification Token 时 fail-open。
2. 卡片 JSON 1.0/2.0 混用与按钮/回调响应不一致。
3. tenant token 失效不刷新。
4. 顺序重试或实例重建后的重复工单/重复卡片。
5. 非法 JSON 500、空 CRON 配置启动失败。
6. @ 机器人文本、机器人自循环、相同 message_id 重复回复。
7. 操作人固定文本、单实例并发接单重复推进。
8. 趋势方向与相等值表达。
9. 督办失败不可重试、完成长期重复提醒、日报口径/时区/重复发送。
10. 3D 与工单卡片 URL 参数错误。
11. 加密回调文档与实际实现不一致。
12. 关键负面、并发、真实载荷形状和超时失败测试缺口。

## 9. 未自动修复

- 跨 Vercel 实例的原子创建/竞争接单：需要持久锁、唯一约束或官方条件更新能力，不能通过进程 Map 伪装。
- 回调真实 3 秒时延：需要部署后的真实飞书测试应用测量。
- messageId/通知状态的长期持久化：当前工单表字段限制不允许擅自加列；可配置 OperationLogs 后再验证。
- 群成员细粒度 RBAC：需要用户确认组织角色、负责人和应用可用范围。
- P3 重构、3D 分块和历史环境变量清理：超出本轮阻断修复范围。

## 10. 需要真实飞书验证

全部标记为 `REQUIRES REAL FEISHU VALIDATION`：

1. 在测试版本发布 JSON 2.0 高风险卡片，确认四个按钮渲染和 `card.action.trigger` 载荷。
2. 使用真实 Bitable `record_id` 接单，测量从按钮点击到回调响应的 P95/P99；必须满足飞书时限。
3. 并发从两个客户端点击接单，并在两个 Vercel 实例下确认只出现一个业务成功结果。
4. 配置 `FEISHU_OPERATION_LOG_TABLE_ID` 后重放相同 event_id/message_id，确认跨实例不重复回复/提醒。
5. 确认机器人权限、入群、chatId、应用可用范围和消息更新权限。
6. 验证 Encrypt Key 实际密文、Token、challenge 和错误响应，不记录任何真实值。

## 11. 安全扫描

结论：未发现真实密钥泄露。详情见 `artifacts/code-review/security-scan.md`。

- `.env.example` 仅占位；`apps/server/.env` 被忽略且未读取。
- 回调不记录完整载荷，错误响应无堆栈。
- 模式扫描命中的长字符串均来自本地测试夹具或 pre-review patch 内同一夹具。
- Computer Use 截图人工确认无二维码/密钥。
- 不存在 `VITE_FEISHU_APP_SECRET` 或其他把 Secret 暴露到浏览器的变量。

## 12. 飞书协议符合性

详见 `artifacts/code-review/feishu-protocol-check.md`。代码层已对齐消息发送、chat_id、JSON 2.0 卡片、回调结构、文本事件、challenge、Token 校验、加密信封、raw response、消息更新、tenant token 缓存/刷新。真实租户渲染、权限、网络时延与多实例语义仍未验证。

## 13. 工单状态机

- 回调只请求目标 `已接单`，调用 `OperationsService.transitionWorkOrder()`，再由共享 `assertWorkOrderTransition()` 校验。
- 没有发现回调直接写飞书“工单状态”绕过业务层。
- 工单定位保持 `recordId → id → workOrderNo`；Feishu Repository 优先按 record_id 单条读取/更新。
- 更新成功后直接返回更新对象；回读失败使用已更新缓存对象并标记“数据同步刷新中”，不错误显示“未找到维修工单”。
- 已完成工单不会再次推进；完成幂等键和备件交易幂等测试通过。
- 单实例并发接单只推进一次；跨实例限制已在 P1-04 如实记录。

## 14. 幂等策略

| 层级 | 当前保证 | 边界 |
| --- | --- | --- |
| 浏览器 Mock | localStorage/演示日志重放 | 单个浏览器演示稳定 |
| 单 Node 实例 | service idempotency Map、回调 inFlight、工单锁 | 实例回收后内存消失 |
| Repository | 稳定工单编号、创建前查重、OperationLogs 可选持久日志 | 并发查重不是原子唯一约束 |
| Vercel 多实例 | 配置真实 OperationLogs 后可识别已完成事件 | 当前未真实验证；工单创建/接单仍需原子协调验证 |

## 15. 环境变量

`.env.example`、`env.ts`、runtime config、README 和配置指南的关键名称一致：

- `FEISHU_VERIFICATION_TOKEN`：仅服务端；缺失时回调端点 503。
- `FEISHU_ENCRYPT_KEY`：仅服务端；仅处理加密信封时需要。
- `FEISHU_NOTIFICATION_CHAT_ID`：仅服务端；缺失时通知返回可重试失败，不回滚工单。
- `FEISHU_OPERATION_LOG_TABLE_ID`：仅服务端；缺失时 OperationLogs 模块使用 Mock，不具备跨实例持久幂等。
- `CRON_SECRET`：仅服务端；空值按未配置，任务端点 503；错误/缺失请求密钥 401。

未发现服务端 Secret 被 Vite 暴露。历史变量 `VITE_ENABLE_ENHANCED_MODEL` 未被当前代码读取，记录为 P3。

## 16. 测试有效性

- 最终 22 个测试文件、99 项测试全部通过。
- 测试不仅检查函数调用，还断言最终工单状态、处理记录次数、库存、预警关闭、知识候选、返回 card schema、不同 intent、错误码和重试次数。
- 回调夹具包含真实 v2 header/event/action/context 形状；消息夹具包含 content JSON、mentions、chat_id 和 message_id。
- 加密测试使用独立 cipher 生成本地向量，但仍不能替代真实飞书密文测试。
- Repository 测试验证 recordId、workOrderNo、回读失败和不存在 404。
- 所有失败路径保留；没有删除测试或降低校验标准。

## 17. 浏览器回归

七问、3D 正常/轴承温升、工单列表、系统设置均通过，截图位于 `artifacts/code-review/browser/`。七个问题得到七类不同答案；未知问题和第八/第九意图由单元/API 测试覆盖。控制台错误为空。浏览器强制离线演示模式，未触发真实工单。

## 18. 最终质量门禁

| 门禁 | 结果 |
| --- | --- |
| lint | 通过 |
| typecheck | 通过 |
| test | 通过：22 文件 / 99 测试 |
| build | 通过；仅既有大分块提示 |
| verify:production | 通过 |
| git diff --check | 通过；仅 LF/CRLF 提示 |

完整记录见 `artifacts/code-review/test-results.md`。

## 19. 修改文件

昨夜功能改动和本轮修复主要涉及：

- Shared：`intent-router.ts`、`diagnosis.ts`、`types.ts`、`schemas.ts`、`index.ts` 及测试。
- Server：`app.ts`、`env.ts`、`errors.ts`、`feishu-client.ts`、`notification-provider.ts`、`feishu-callback-service.ts`、`operations-jobs-service.ts`、`operations-service.ts` 及测试。
- Web：`AiAssistantPage.tsx`、`EquipmentDetailPage.tsx`、`api.ts`、`offline-api.ts` 及测试。
- 配置/文档：`.env.example`、`README.md`、`package.json`、机器人指南、人工配置清单、隔夜报告、模拟脚本。
- 审查证据：`artifacts/code-review/` 和本报告。

本轮没有修改 3D 模型文件、3D 页面视觉、工单字段结构或 Vercel 配置。

## 20. 是否建议用户点击“审核”

**结论 B：有条件审核。**

代码层 P0 已清除，六项门禁全部通过，可以进入人工差异审阅；但不要把“审核”理解为可直接 Production 发布。用户下一步应先在 Codex/Git 界面查看本报告和当前 diff，然后点击“审核”查看改动，不要点击提交/推送/部署。真实飞书测试版本仍需按第 10 节逐项验收，特别是 3 秒回调和 Vercel 多实例原子幂等。
