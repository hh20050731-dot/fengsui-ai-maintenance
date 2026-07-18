import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharedRoot = path.join(root, 'packages', 'shared');
const sharedDist = path.join(sharedRoot, 'dist');
const serverDistEntry = path.join(root, 'apps', 'server', 'dist', 'index.js');
const apiEntry = path.join(root, 'api', 'index.ts');
const webPublicModels = path.join(root, 'apps', 'web', 'public', 'models');
const webDistModels = path.join(root, 'apps', 'web', 'dist', 'models');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[production-check] ${message}`);
}
const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

function assertGlb(file: string) {
  assert(existsSync(file), `缺少GLB文件：${path.relative(root, file)}`);
  const data = readFileSync(file);
  assert(data.toString('ascii', 0, 4) === 'glTF', `${path.relative(root, file)} 不是有效GLB`);
  assert(data.readUInt32LE(4) === 2, `${path.relative(root, file)} 不是glTF 2.0`);
}

const sharedPackage = readJson(path.join(sharedRoot, 'package.json'));
const packageEntryConfig = JSON.stringify({
  main: sharedPackage.main,
  module: sharedPackage.module,
  types: sharedPackage.types,
  exports: sharedPackage.exports,
});
assert(!packageEntryConfig.includes('/src/') && !packageEntryConfig.includes('./src'), '@fengsui/shared 的生产入口不得指向 src');
assert(sharedPackage.main === './dist/index.js', '@fengsui/shared main 必须指向 ./dist/index.js');
assert(sharedPackage.types === './dist/index.d.ts', '@fengsui/shared types 必须指向 ./dist/index.d.ts');

const sharedJsEntry = path.join(sharedDist, 'index.js');
const sharedTypesEntry = path.join(sharedDist, 'index.d.ts');
assert(existsSync(sharedJsEntry), '缺少 packages/shared/dist/index.js');
assert(existsSync(sharedTypesEntry), '缺少 packages/shared/dist/index.d.ts');

for (const file of readdirSync(sharedDist).filter((name) => name.endsWith('.js'))) {
  const source = readFileSync(path.join(sharedDist, file), 'utf8');
  const relativeImports = [...source.matchAll(/(?:from\s+|import\s*\()\s*['"](\.[^'"]+)['"]/g)].map((match) => match[1]);
  assert(relativeImports.every((specifier) => specifier?.endsWith('.js')), `${file} 存在缺少 .js 后缀的 ESM 相对导入`);
}

assert(existsSync(serverDistEntry), '缺少 apps/server/dist/index.js');
const serverOutput = readFileSync(serverDistEntry, 'utf8');
assert(!serverOutput.includes('@fengsui/shared/src'), '服务端构建产物仍引用 @fengsui/shared/src');
const apiSource = readFileSync(apiEntry, 'utf8');
assert(!apiSource.includes('.listen('), 'Vercel Function 入口不得调用 app.listen()');

for (const fileName of ['induced-draft-fan.glb', 'induced-draft-fan-enhanced-v1.glb']) {
  const sourceModel = path.join(webPublicModels, fileName);
  const builtModel = path.join(webDistModels, fileName);
  assertGlb(sourceModel);
  assertGlb(builtModel);
  assert(statSync(sourceModel).size === statSync(builtModel).size, `${fileName} 未完整复制到前端构建产物`);
}

await import(pathToFileURL(sharedJsEntry).href);
process.env.NODE_ENV = 'test';
process.env.VERCEL = '1';
process.env.APP_MODE = 'mock';
process.env.APP_BASE_URL = 'http://localhost:5173';
const serverModule = await import(pathToFileURL(serverDistEntry).href) as { default?: unknown };
assert(typeof serverModule.default === 'function', '编译后的服务端未导出 Express app');
const functionModule = await import('../api/index.js') as { default?: unknown };
assert(typeof functionModule.default === 'function', 'Vercel Function 初始化后未导出 Express app');

const httpServer = createServer(functionModule.default as Parameters<typeof createServer>[0]);
await new Promise<void>((resolve, reject) => {
  httpServer.once('error', reject);
  httpServer.listen(0, '127.0.0.1', resolve);
});
try {
  const address = httpServer.address();
  assert(address && typeof address === 'object', '无法获得生产检查服务地址');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
  const payload = await response.json() as { success?: boolean; data?: { status?: string } };
  assert(response.status === 200 && payload.success === true && payload.data?.status === 'ok', '/api/health 未返回 200 JSON');
} finally {
  await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
}

console.log('[production-check] shared ESM、服务端导入、Vercel Function、/api/health 与双版本GLB资源均通过');
