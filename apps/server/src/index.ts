import { createApp } from './app.js';
import { env } from './config/env.js';

const { app } = createApp();
if (env.NODE_ENV !== 'test' && process.env.VERCEL !== '1') {
  app.listen(env.PORT, () => console.log(`烽燧服务已启动：http://localhost:${env.PORT}`));
}
export default app;
