# 腾讯云 EdgeOne Makers 备用部署指南

本指南仅准备备用静态演示站，不删除或替换现有 Vercel 部署，也不要求把飞书服务端 Secret 配置到静态前端。

## 控制台完整填写项

| 配置项 | 填写值 |
|---|---|
| Git 仓库根目录 | 仓库根目录 `.` |
| 前端项目源码目录 | `apps/web`（仅用于识别源码位置；构建工作目录仍选仓库根目录） |
| Framework Preset | Vite（若自动识别可保持自动） |
| 安装命令 | `npm ci` |
| 构建命令 | `npm run build:edgeone` |
| 输出目录 | `apps/web/dist` |
| Node.js 版本 | `20.18.0` |
| 生产分支 | 当前 Git 主分支（当前仓库为 `main`） |

必须从仓库根目录构建，因为 `apps/web` 显式依赖 workspace 中的 `packages/shared`。不要把 EdgeOne 项目工作目录直接改成 `apps/web`，否则会绕过根锁文件和共享包构建。

仓库根目录的 `edgeone.json` 已声明以上安装、构建、输出和 Node 版本，并为哈希前端资产与 GLB 模型设置缓存头。EdgeOne 官方目前建议使用其预装的明确 Node 版本；本项目选择官方列出的 `20.18.0`。

## 环境变量

`npm run build:edgeone` 已通过 Vite 的 `edgeone` 构建模式强制启用浏览器本地演示仓库，因此备用静态站没有必填环境变量。可在 EdgeOne 项目的 Production 和 Preview 环境中增加以下显式配置，方便控制台审计：

| 变量 | 值 | 说明 |
|---|---|---|
| `VITE_OFFLINE_DEMO` | `true` | 可选但推荐；显式标记静态备用站使用浏览器本地模拟仓库 |
| `VITE_APP_MODE` | `mock` | 可选但推荐；明确标记比赛演示模式 |
| `VITE_API_BASE_URL` | 不设置 | 不请求 Vercel；即使平台注入默认值，强制离线也不会调用 |
| `VITE_FEISHU_APP_ID` | 不设置 | 备用静态演示站不执行飞书免登 |

不需要也不应配置 `FEISHU_APP_SECRET`、tenant token、OpenAI Key 或其他服务端 Secret。所有 `VITE_` 变量会进入浏览器构建产物，严禁放入敏感信息。

若未来把 Node API 同步迁移到可在中国大陆稳定访问的服务，再将 `VITE_OFFLINE_DEMO=false` 并把 `VITE_API_BASE_URL` 设置为该服务的 HTTPS `/api` 地址；此操作不属于当前备用静态站范围。

## SPA 路由回退

官方 `edgeone.json` 文档说明静态 `rewrites` 不支持 SPA 前端路由回退，因此仓库使用 EdgeOne 官方 Middleware 能力：根目录 `middleware.js` 仅对 `Accept: text/html`、GET、无文件扩展名且非 `/api` 的请求执行 `rewrite('/index.html')`。

这保证刷新 `/digital-twin`、`/equipment/IDF-001`、`/alerts/...` 等路径不返回平台 404，同时不会把以下内容错误改写成 HTML：

- `/models/induced-draft-fan.glb`
- `/assets/*.js`、`/assets/*.css`
- `/api/*`

上线后至少直接在地址栏访问并刷新 `/digital-twin?equipment=IDF-01&fault=bearing-overheat` 做一次确认。

## 构建产物核对

本地执行：

```powershell
npm ci
npm run build:edgeone
Test-Path apps/web/dist/index.html
Test-Path apps/web/dist/models/induced-draft-fan.glb
```

两项都应返回 `True`。EdgeOne 构建日志中输出目录必须是 `apps/web/dist`，该目录根部必须有 `index.html`。

## 部署后的人工验证

1. 打开 EdgeOne 分配的 HTTPS 地址，确认顶部显示“离线演示模式”。
2. 浏览器开发者工具 Network 中确认没有 `vercel.app`、Google Fonts、第三方 CDN 或在线 HDR 请求。
3. 直接刷新 `/digital-twin`，确认不出现 404。
4. 确认 `/models/induced-draft-fan.glb` 返回 200，响应大小约 18.1 MiB。
5. 切换四种数字孪生状态并查看趋势图。
6. 从轴承温升或联轴器不对中场景创建模拟工单。
7. 刷新页面，确认本地工单仍存在。
8. 在系统设置执行二次确认重置，确认恢复初始状态。

EdgeOne 项目 URL 和自定义域名必须由用户登录控制台后取得；仓库不会擅自登录或修改云账号。
