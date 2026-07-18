/** EdgeOne Makers SPA 路由回退：仅改写浏览器 HTML 导航，不接管 API 与静态资源。 */
export function middleware(context) {
  const { request, next, rewrite } = context;
  const url = new globalThis.URL(request.url);
  const acceptsHtml = request.headers.get('accept')?.includes('text/html');
  const isStaticAsset = /\.[^/]+$/.test(url.pathname);
  const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');
  if (request.method === 'GET' && acceptsHtml && !isStaticAsset && !isApi) return rewrite('/index.html');
  return next();
}

export const config = { matcher: '/:path*' };
