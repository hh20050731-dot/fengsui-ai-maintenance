# 烽燧——面向垃圾焚烧发电厂的设备故障预警与智能运维系统

飞书 AI 创新比赛原型。项目交付形态为“飞书企业自建网页应用 + 飞书应用机器人 + 飞书多维表格数据底座”，同时支持普通浏览器独立演示。

> 当前仓库内置的设备、监测、诊断、预警和维修数据均为模拟演示数据，不代表真实设备诊断结果。健康度和诊断结论来自可解释规则模型，未宣称接入真实垃圾焚烧厂或取得生产准确率。

## 已实现能力

- 12 台关键设备台账，支持查询、组合筛选、健康度排序、卡片/表格视图、新增与编辑。
- 24 小时可复现时序数据，以及 7 天、30 天聚合展示；启动、高负荷、异常发展和维修恢复趋势符合演示工程逻辑。
- 工况基准、指标偏离、设备类型权重、贡献度、健康度与风险等级的独立规则模块及单元测试。
- 总览、设备详情、预警、辅助研判、维修工单、备件库存、知识库、系统设置八个可切换页面。
- “1号引风机”完整数据闭环：68 分预警 → 诊断 → 消息卡片 → 工单 → 检修 → 备件扣减 → 验证 → 92 分健康 → 预警关闭 → 操作记录。
- 工单状态机、必要字段校验、库存预检查、幂等完成、审计记录与知识库候选案例说明。
- Mock / Feishu Repository、认证、通知和研判 Provider 适配器；飞书配置不完整时安全降级。
- 飞书 `requestAccess` 免登（旧客户端回退 `requestAuthCode`）、tenant token 缓存、多维表格 CRUD、机器人交互卡片和事件挑战校验。
- Vitest 单元/接口测试、Supertest 闭环测试与 Playwright 端到端脚本。

## 技术栈

- 前端：React 19、TypeScript、Vite、Tailwind CSS、React Router、TanStack Query、React Hook Form、Zod、Recharts。
- 后端：Node.js、TypeScript、Express 5、Zod、原生 Fetch 飞书 OpenAPI 适配。
- 测试与质量：Vitest、Supertest、Playwright、ESLint、Prettier、TypeScript strict。
- 部署：Vercel Serverless 或普通 Node 服务器。

## 目录

```text
apps/web/                  React 网页应用
apps/server/               Express API、领域服务、Repository/Provider
packages/shared/           共享类型、规则、状态机和 Mock 数据
api/index.ts               Vercel Serverless 入口
config/bitable-schema.json 多维表格结构声明
scripts/                   多维表格初始化与种子脚本
docs/                      飞书配置、部署、演示与排错文档
e2e/                       Playwright 完整闭环测试
```

## 本地启动（Mock 模式）

要求 Node.js 20 或更高版本。项目已在 Node 24 / npm 11 下验证。

```bash
npm install
copy .env.example .env
npm run dev
```

访问 `http://localhost:5173`。后端为 `http://localhost:3001`。`.env` 中保持 `APP_MODE=mock`，无需任何飞书凭证。浏览器演示用户为“黄浩 / 项目演示员”。

### Mock 演示数据的保存与重置

Mock 模式会把成功的设备、预警、工单和库存操作记录保存在当前浏览器的 `localStorage` 中，并在每次请求时由服务端从固定初始数据重放这些操作。业务状态仍由现有服务端状态机和校验逻辑计算，因此即使 Vercel Serverless 实例被回收或请求落到其他实例，下列演示结果在页面跳转和刷新后仍会保留：

- 工单状态、维修记录和验证结果；
- 1号引风机健康度从 68 恢复到 92、风险等级恢复健康；
- 关联预警自动关闭；
- 风机轴承库存从 6 扣减到 5，重复完成不会再次扣减；
- 维修闭环形成的知识库候选案例。

该数据仅对当前浏览器生效，不会跨浏览器、跨设备共享。需要重复比赛演示时，进入“系统设置 → 比赛演示数据”，点击“重置演示数据”并完成两次确认，即可恢复健康度 68、原始预警、初始工单和库存。清理浏览器站点数据也会得到相同效果。

Feishu 真实模式不会把 `localStorage` 作为数据源，也不会重放浏览器演示日志；设备、工单和库存仍由 `FeishuBitableRepository` 读写飞书多维表格。

质量命令：

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

## 切换飞书真实模式

复制 `.env.example` 为 `.env`，将 `APP_MODE` 和 `VITE_APP_MODE` 改为 `feishu`，至少配置：

- `FEISHU_APP_ID`、`FEISHU_APP_SECRET`
- `FEISHU_BITABLE_APP_TOKEN`
- Equipment、Telemetry、HealthSnapshots、Alerts、WorkOrders、SpareParts、SparePartTransactions、KnowledgeBase、OperationLogs 的表 ID
- 前端公开的 `VITE_FEISHU_APP_ID`
- 发送机器人消息时的 `FEISHU_NOTIFICATION_CHAT_ID`

任一必要项缺失时，服务端只记录缺失变量名并自动使用 Mock，不会输出 Secret/Token，也不会导致页面白屏。详细来源和后台操作见 [飞书自建应用创建指南](docs/03-飞书自建应用创建指南.md) 与 [本地运行指南](docs/02-本地运行指南.md)。

## 环境变量速查

| 变量 | 用途 | Feishu 必填 | Mock 需要 | 获取位置 |
|---|---|---:|---:|---|
| `NODE_ENV` | 运行环境 | 是 | 否 | 自行设置 |
| `APP_MODE` | `mock` / `feishu` | 是 | 是 | 自行设置 |
| `APP_BASE_URL` | 卡片跳转和外部访问根地址 | 是 | 否 | 部署域名 |
| `FEISHU_APP_ID` | 应用唯一标识 | 是 | 否 | 开发者后台“凭证与基础信息” |
| `FEISHU_APP_SECRET` | 服务端换取令牌 | 是 | 否 | 同上；仅放服务端 |
| `FEISHU_VERIFICATION_TOKEN` | 事件来源校验 | 开启事件回调时 | 否 | 事件订阅配置 |
| `FEISHU_ENCRYPT_KEY` | 加密事件预留 | 使用加密事件时 | 否 | 事件订阅配置 |
| `FEISHU_BITABLE_APP_TOKEN` | 多维表格 App Token | 是 | 否 | 多维表格 URL |
| `FEISHU_*_TABLE_ID` | 九张表的 table_id | 是 | 否 | 多维表格 URL / 初始化脚本输出 |
| `FEISHU_NOTIFICATION_CHAT_ID` | 机器人默认会话 | 发送群消息时 | 否 | 目标会话 ID |
| `AI_PROVIDER` | `rule` / 预留真实 Provider | 否 | 否 | 自行设置 |
| `OPENAI_API_KEY`、`OPENAI_MODEL` | 预留真实大模型 | 选择相应 Provider 时 | 否 | 模型服务商 |
| `VITE_API_BASE_URL` | 浏览器 API 地址 | 视部署方式 | 可选 | 部署 API 地址；同域留空/`/api` |
| `VITE_APP_MODE` | 前端显示模式提示 | 是 | 否 | 与服务端一致 |
| `VITE_FEISHU_APP_ID` | 端内免登 App ID（可公开） | 是 | 否 | 开发者后台 |
| `DRY_RUN` | 初始化脚本只检查/写入 | 首次建议 `true` | 否 | 自行设置 |

严禁创建 `VITE_FEISHU_APP_SECRET`。所有 Secret、访问令牌和 API Key 只允许进入服务端环境变量。

## 部署

```bash
npm run build
NODE_ENV=production npm run start -w @fengsui/server
```

普通 Node 服务器会从 `apps/web/dist` 提供前端并托管 `/api`。Vercel 配置见 `vercel.json` 和 [Vercel 部署指南](docs/09-Vercel部署指南.md)。生产飞书网页应用必须使用 HTTPS。

## 需要用户完成

1. 在飞书开放平台创建/选择企业自建应用，开启网页应用和机器人能力。
2. 获取 App ID / Secret 并安全写入部署平台环境变量；不得提交到 Git。
3. 创建多维表格、将应用设为可管理协作者，执行 DRY_RUN 后再初始化/写入演示种子。
4. 申请并由管理员审核最小权限、发布测试版本、添加测试人员。
5. 填写网页应用主页、重定向 URL、H5 可信域名、事件回调 URL。
6. 选择通知群/用户并填写会话 ID；完成真实消息与卡片回调联调。

所有账号、Secret、管理员审批和发布操作无法由代码代替。

## 文档导航

- [项目说明](docs/01-项目说明.md) · [本地运行](docs/02-本地运行指南.md) · [创建飞书应用](docs/03-飞书自建应用创建指南.md)
- [免登配置](docs/04-飞书网页应用免登配置.md) · [多维表格字段](docs/05-多维表格字段模板.md) · [初始化](docs/06-多维表格初始化指南.md)
- [机器人](docs/07-机器人配置指南.md) · [权限](docs/08-权限清单.md) · [Vercel](docs/09-Vercel部署指南.md)
- [比赛演示脚本](docs/10-比赛演示脚本.md) · [排错](docs/11-常见问题与排错.md) · [真实数据接入](docs/12-真实数据接入说明.md)
