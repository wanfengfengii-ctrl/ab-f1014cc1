// 本机静态 Web 服务：仅托管构建产物 dist/。
// WEB_PORT 配置监听端口（同时被 docker compose 映射到宿主机）。
// /healthz 供容器健康检查使用。

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize, sep } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const distDir = join(root, 'dist');
const PORT = Number.parseInt(process.env.WEB_PORT || '8080', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/healthz') {
    send(res, 200, JSON.stringify({ status: 'ok' }), 'application/json');
    return;
  }

  let pathPart = decodeURIComponent(url.pathname);
  if (pathPart === '/') pathPart = '/index.html';
  const safe = normalize(pathPart).replace(/^([/\\]+)/, '');
  const filePath = join(distDir, safe);
  if (!filePath.startsWith(`${distDir}${sep}`)) {
    send(res, 403, 'Forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    send(res, 200, body, MIME[extname(filePath)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`静态服务监听 http://0.0.0.0:${PORT}（健康检查 /healthz）`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
