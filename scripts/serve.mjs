// 零依赖静态 Web 服务：仅托管 dist/，提供 /healthz 健康检查。
// 端口由 WEB_PORT（兼容 PORT）环境变量配置，默认 8080。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const PORT = Number(process.env.WEB_PORT || process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  // 防目录穿越
  const filePath = path.normalize(path.join(dist, rel));
  if (!filePath.startsWith(dist + path.sep) && filePath !== dist) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  try {
    const data = await readFile(filePath);
    const type = MIME[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 未找到');
  }
});

server.listen(PORT, () => {
  console.log(`[web] 静态服务已启动：http://0.0.0.0:${PORT}（健康检查 /healthz）`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
