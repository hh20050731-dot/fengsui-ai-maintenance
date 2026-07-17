# 09 Vercel 部署指南

## 部署

1. 将仓库推送到私有 Git 服务，确认未提交 `.env`。
2. 在 Vercel 导入根目录。项目已提供 `vercel.json`，构建命令为 `npm run build`，静态输出为 `apps/web/dist`，API 入口为 `api/index.ts`。
3. 在 Project Settings → Environment Variables 逐项添加 `.env.example` 中服务端变量。Secret 使用 Sensitive 标记。
4. 设置 `NODE_ENV=production`、`APP_BASE_URL=https://正式域名`。同域部署时 `VITE_API_BASE_URL=/api` 或留空使用默认 `/api`。
5. 部署后访问 `/api/health`、`/api/integration/status` 和各前端路由。

## 飞书后台

- 网页应用桌面/移动主页：`https://域名/`
- 重定向 URL：`https://域名/`
- H5 可信域名：`https://域名`
- 事件回调：`https://域名/api/feishu/events`

所有地址必须使用真实可访问的 HTTPS 域名。域名变更后同时更新 `APP_BASE_URL` 并重新部署，否则卡片链接仍指向旧地址。

## Serverless 限制

Mock Repository 使用内存状态。Vercel 实例回收后会恢复初始数据，因此完整比赛演示建议在同一会话连续完成；Feishu 模式写入多维表格，不受实例回收影响。生产化还应把幂等键/事件去重和应用会话放入持久存储。

如果 Vercel 运行时或路由行为随平台版本变化，请先用 Preview Deployment 验证 `/api/*` 保留原始路径；必要时使用 Vercel 当前官方 Express 集成模板调整 catch-all 函数，不能把未验证的预览当作发布成功。
