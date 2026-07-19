// 端到端测试必须强制使用隔离的 Mock 仓库，禁止读取或写入真实飞书数据。
export {};

process.env.NODE_ENV = 'test';
process.env.APP_MODE = 'mock';

const { createApp } = await import('../apps/server/src/app.js');
const { app } = createApp({ forceMock: true });
const server = app.listen(4000, '127.0.0.1', () => {
  console.log('[e2e-server] ready http://127.0.0.1:4000');
});

const shutdown = () => server.close(() => process.exit(0));
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
