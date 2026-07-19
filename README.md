# 烽燧——面向垃圾焚烧发电厂的设备故障预警与智能运维系统

飞书 AI 创新比赛原型。项目交付形态为“飞书企业自建网页应用 + 飞书应用机器人 + 飞书多维表格数据底座”，同时支持普通浏览器独立演示。

当前正式版本采用深色工业指挥中心主题；全站统一使用 `AppSidebar`、`TopStatusBar` 和工业主题变量，3D 数字孪生默认加载增强模型 v1，并保留原模型回退入口。

> 当前仓库内置的设备、监测、诊断、预警和维修数据均为模拟演示数据，不代表真实设备诊断结果。健康度和诊断结论来自可解释规则模型，未宣称接入真实垃圾焚烧厂或取得生产准确率。

## 已实现能力

- 12 台关键设备台账，支持查询、组合筛选、健康度排序、卡片/表格视图、新增与编辑。
- 24 小时可复现时序数据，以及 7 天、30 天聚合展示；启动、高负荷、异常发展和维修恢复趋势符合演示工程逻辑。
- 工况基准、指标偏离、设备类型权重、贡献度、健康度与风险等级的独立规则模块及单元测试。
- 总览、设备详情、预警、辅助研判、维修工单、备件库存、知识库、系统设置八个可切换页面。
- “1号引风机”完整数据闭环：68 分预警 → 诊断 → 消息卡片 → 工单 → 检修 → 备件扣减 → 验证 → 92 分健康 → 预警关闭 → 操作记录。
- 工单状态机、必要字段校验、库存预检查、幂等完成、审计记录与知识库候选案例说明。
- Mock / Feishu Repository、认证、通知和研判 Provider 适配器；飞书配置不完整时安全降级。
- 飞书 `requestAccess` 免登（旧客户端回退 `requestAuthCode`）、tenant token 缓存、多维表格 CRUD、高风险工单卡片、加密回调、机器人意图查询、自动督办和日报。
- Vitest 单元/接口测试、Supertest 闭环测试与 Playwright 端到端脚本。

### 比赛最终成品增强

- 内置 10 个可追溯故障案例、轻量本地 RAG 与引用展示；无匹配时不生成虚假来源。
- `MaintenanceAgent` 复用设备、趋势、预警、历史、知识、库存、诊断、工单、通知和知识候选十类工具，带最大步骤、超时、重复工单检测和默认人工确认。
- 可选豆包结构化 Provider 只从服务端读取 `DOUBAO_API_KEY`、`DOUBAO_MODEL`、`DOUBAO_BASE_URL`；缺少凭证或调用失败时自动使用规则安全回退。
- 多模态巡检入口支持 JPG/PNG/WebP 和 8MB 校验；未配置真实视觉模型时明确使用“图片 + 遥测 + RAG”演示关联，不声称识别具体缺陷。
- 3D 模型库新增工业电机、轴承、联轴器、给水泵、循环水泵、炉排减速机、空压机和渗滤液泵；各含 Blend 源文件、LOD0/1/2、语义节点、预览和验证报告。
- 新增“六大核心技能映射”页面 `/capabilities`，把比赛能力与功能、技术、Demo 步骤和交付证据对应。
- 比赛材料、系统说明、真实性边界与截图证据统一位于 `deliverables/`。

## 技术栈

- 前端：React 19、TypeScript、Vite、Tailwind CSS、React Router、TanStack Query、React Hook Form、Zod、Recharts。
- 后端：Node.js、TypeScript、Express 5、Zod、原生 Fetch 飞书 OpenAPI 适配。
- 测试与质量：Vitest、Supertest、Playwright、ESLint、Prettier、TypeScript strict。
- 部署：Vercel Serverless 或普通 Node 服务器。
- 备用部署：腾讯云 EdgeOne Makers 静态站点（浏览器离线演示数据适配器）。

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

### 无外网演示与生产预览

完全离线演示不需要启动 Node API。`build:edgeone` 会固定使用 Vite 的 `edgeone` 模式并直接启用浏览器本地模拟仓库，不会先尝试 `/api` 或飞书 SDK：

```powershell
npm run build:edgeone
npm run preview -- --host 0.0.0.0
```

本机访问 `http://localhost:4173`；同一局域网内的其他设备访问 `http://<演示电脑局域网IP>:4173`。首次使用局域网访问时，Windows 防火墙可能要求允许 Node.js 在“专用网络”通信。GLB、图标和全部前端脚本均由 `apps/web/dist` 本地提供。详细验证和外部资源清单见 [离线演示保障](docs/13-离线演示保障与外部资源清单.md)。

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
- 当前真实工单同步至少配置 `FEISHU_WORK_ORDER_TABLE_ID`；其他表仅在启用对应真实模块时配置
- 前端公开的 `VITE_FEISHU_APP_ID`
- 发送机器人消息时的 `FEISHU_NOTIFICATION_CHAT_ID`

飞书客户端基础能力只要求 `FEISHU_APP_ID`、`FEISHU_APP_SECRET` 和 `FEISHU_BITABLE_APP_TOKEN`。各业务模块按自身表 ID 独立启用：例如只配置 `FEISHU_WORK_ORDER_TABLE_ID` 时，维修工单真实读写飞书，设备、遥测、预警和备件等未配置模块继续使用 Mock，不会触发全局降级。服务端只记录缺失变量名，不会输出 Secret/Token。详细来源和后台操作见 [飞书自建应用创建指南](docs/03-飞书自建应用创建指南.md) 与 [本地运行指南](docs/02-本地运行指南.md)。

## 环境变量速查

| 变量 | 用途 | Feishu 必填 | Mock 需要 | 获取位置 |
|---|---|---:|---:|---|
| `NODE_ENV` | 运行环境 | 是 | 否 | 自行设置 |
| `APP_MODE` | `mock` / `feishu` | 是 | 是 | 自行设置 |
| `APP_BASE_URL` | 卡片跳转和外部访问根地址 | 是 | 否 | 部署域名 |
| `FEISHU_APP_ID` | 应用唯一标识 | 是 | 否 | 开发者后台“凭证与基础信息” |
| `FEISHU_APP_SECRET` | 服务端换取令牌 | 是 | 否 | 同上；仅放服务端 |
| `FEISHU_VERIFICATION_TOKEN` | 事件来源校验 | 开启事件回调时 | 否 | 事件订阅配置 |
| `FEISHU_ENCRYPT_KEY` | 解密飞书加密回调信封 | 使用加密事件时 | 否 | 事件订阅配置；仅服务端 |
| `FEISHU_BITABLE_APP_TOKEN` | 多维表格 App Token | 是 | 否 | 多维表格 URL |
| `FEISHU_*_TABLE_ID` | 各业务表的 table_id；按启用模块分别配置 | 对应模块启用时 | 否 | 多维表格 URL / 初始化脚本输出 |
| `FEISHU_NOTIFICATION_CHAT_ID` | 机器人默认会话 | 发送群消息时 | 否 | 目标会话 ID |
| `CRON_SECRET` | 保护自动督办与日报接口 | 启用定时任务时 | 否 | 自行生成至少32位随机值；仅服务端 |
| `AI_PROVIDER` | `rule` / 预留真实 Provider | 否 | 否 | 自行设置 |
| `OPENAI_API_KEY`、`OPENAI_MODEL` | 预留真实大模型 | 选择相应 Provider 时 | 否 | 模型服务商 |
| `VITE_API_BASE_URL` | 浏览器 API 地址 | 视部署方式 | 可选 | 部署 API 地址；同域留空/`/api` |
| `VITE_APP_MODE` | 前端显示模式提示 | 是 | 否 | 与服务端一致 |
| `VITE_FEISHU_APP_ID` | 端内免登 App ID（可公开） | 是 | 否 | 开发者后台 |
| `VITE_OFFLINE_DEMO` | `true` 时强制使用浏览器本地演示仓库；未设置时接口故障也会自动降级 | 否 | 静态备用部署建议 | 自行设置 |
| `DRY_RUN` | 初始化脚本只检查/写入 | 首次建议 `true` | 否 | 自行设置 |

严禁创建 `VITE_FEISHU_APP_SECRET`。所有 Secret、访问令牌和 API Key 只允许进入服务端环境变量。

## 飞书原生协同接口

- `POST /api/feishu/events`：challenge、Verification Token、Encrypt Key 加密回调、卡片接单/暂缓、机器人文本消息。
- `POST /api/jobs/work-order-reminders`：高风险30分钟未接单、4小时内到期、待验证与完成提醒。
- `POST /api/jobs/daily-operations-brief`：生成并发送每日运维简报。

两个定时任务接口必须使用 `Authorization: Bearer <CRON_SECRET>` 或 `x-cron-secret`。本地生成卡片、回调、七类查询、督办和日报模拟证据：

```bash
npm run simulate:feishu
```

输出位于 `artifacts/feishu/`，全部明确标注 `LOCAL SIMULATION — NOT REAL FEISHU CALLBACK`，不能作为真实飞书联调成功证据。明日人工配置步骤见 [飞书原生协同手动清单](docs/飞书原生协同_明日手动配置清单.md)。

## 部署

```bash
npm run build
NODE_ENV=production npm run start -w @fengsui/server
```

普通 Node 服务器会从 `apps/web/dist` 提供前端并托管 `/api`。Vercel 配置见 `vercel.json` 和 [Vercel 部署指南](docs/09-Vercel部署指南.md)。生产飞书网页应用必须使用 HTTPS。

腾讯云 EdgeOne Makers 备用站点保持仓库根目录构建，使用 `npm ci`、`npm run build:edgeone`、输出 `apps/web/dist`；该构建命令已强制启用离线演示模式，平台可额外设置 `VITE_OFFLINE_DEMO=true` 作为显式标识。仓库已提供 `edgeone.json` 与只处理 HTML 导航的 `middleware.js`，用于 `/digital-twin` 等 SPA 路由刷新回退；不会影响现有 Vercel 配置。完整控制台填写项见 [EdgeOne Pages 备用部署指南](docs/14-EdgeOne-Pages备用部署指南.md)。

### 正式发布流程

正式发布只以 GitHub `main` 为唯一生产来源：

1. 从最新 `main` 创建 feature branch；
2. 推送 feature branch，由 Vercel Preview 验证页面、API、3D 模型和飞书安全降级；
3. 质量门禁全部通过后，将 feature branch 合并回 `main`；
4. 推送 `main`，由 Vercel Production 自动发布并更新正式域名；
5. 不得将未合并的功能分支长期设置为 Production Branch，也不得回滚到旧浅色界面提交。

`npm run verify:production` 会检查深色工业 `MainLayout` 标识、共享包生产入口、Vercel Function、双版本 GLB、浏览器 Secret 隔离和 Service Worker 缓存风险。生产飞书凭证失效时，`/api/integration/status` 会分别返回 `configured`、`authenticated`、`effectiveMode` 和 `safeErrorCode`；演示模块继续加载 Mock 数据，飞书工单写入明确暂停且不会伪装成 Mock 成功。

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
- [离线演示与外部资源清单](docs/13-离线演示保障与外部资源清单.md) · [EdgeOne Pages 备用部署](docs/14-EdgeOne-Pages备用部署指南.md)
- [飞书原生协同明日配置清单](docs/飞书原生协同_明日手动配置清单.md) · [隔夜执行报告](docs/overnight-final-report.md)
