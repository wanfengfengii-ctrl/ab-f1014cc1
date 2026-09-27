// 业务冒烟（compose verify 服务执行）：
//  1) 载入 fixtures/valid.json —— 必须核验通过
//  2) 载入 fixtures/crossing.json —— 必须以 EDGE_CROSSING 拒绝
//  3) 启动 dist/ 静态服务，GET /healthz、/、/src/app.js —— 必须正常
// 任一失败即以非零退出码报告。
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMesh } from '../src/geometry.js';
import { parsePointsText, parseTrianglesText } from '../src/parser.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
let failures = 0;

function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.error(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function loadJsonFixture(file) {
  return JSON.parse(await readFile(path.join(root, 'fixtures', file), 'utf8'));
}

async function smokeFixtures() {
  console.log('[smoke] 1/3 有效网格');
  const valid = await loadJsonFixture('valid.json');
  const rv = validateMesh(valid.points, valid.triangles);
  check('valid.json 核验通过', rv.ok, rv.message);
  if (rv.ok) {
    check('边界环唯一且为 1→2→3→4', rv.boundaryLoop.join(',') === '1,2,3,4');
    check('内部边均为两面相邻', rv.edges.filter((e) => !rv.boundaryEdgeKeys.includes(e.key)).every((e) => e.faces.length === 2));
  }

  console.log('[smoke] 2/3 交叉网格');
  const crossing = await loadJsonFixture('crossing.json');
  const rc = validateMesh(crossing.points, crossing.triangles);
  check('crossing.json 被拒绝', !rc.ok);
  check('拒绝原因为边交叉（EDGE_CROSSING）', rc.code === 'EDGE_CROSSING', `实际 ${rc.code}`);
  check('指出首对交叉边 2-3 与 4-5',
    rc.evidence?.edge1?.join('-') === '2-3' && rc.evidence?.edge2?.join('-') === '4-5',
    JSON.stringify(rc.evidence));

  // 文本解析链路与浏览器录入一致
  const parsedOk = parsePointsText(
    valid.points.map((p) => `${p.id} ${p.x} ${p.y}`).join('\n'),
  );
  check('文本解析与 JSON 测点一致', JSON.stringify(parsedOk.data) === JSON.stringify(valid.points));
}

function waitFor(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve(res);
      } catch { /* 尚未就绪 */ }
      if (Date.now() > deadline) return reject(new Error(`等待 ${url} 超时`));
      setTimeout(attempt, 150);
    };
    attempt();
  });
}

async function smokeServer() {
  console.log('[smoke] 3/3 静态服务与健康检查');
  const PORT = Number(process.env.SMOKE_WEB_PORT || 8099);
  const child = spawn(process.execPath, [path.join(root, 'scripts', 'serve.mjs')], {
    cwd: root,
    env: { ...process.env, WEB_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write(`[serve] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[serve] ${d}`));

  try {
    const base = `http://127.0.0.1:${PORT}`;
    const health = await waitFor(`${base}/healthz`);
    const body = await health.json();
    check('GET /healthz 返回 200 且 status=ok', body.status === 'ok', JSON.stringify(body));

    const home = await fetch(`${base}/`);
    check('GET / 返回 200', home.status === 200);
    const html = await home.text();
    check('首页引用模块脚本 src/app.js', html.includes('src="src/app.js"'));
    check('首页包含核验按钮', html.includes('id="verifyBtn"'));

    const appJs = await fetch(`${base}/src/app.js`);
    check('GET /src/app.js 返回 200', appJs.status === 200);
    check('app.js 引入核验核心', (await appJs.text()).includes("from './geometry.js'"));

    const missing = await fetch(`${base}/../etc/passwd`);
    check('路径穿越被拦截（非 200）', missing.status === 400 || missing.status === 403 || missing.status === 404,
      `实际 ${missing.status}`);
  } finally {
    child.kill('SIGTERM');
  }
}

async function main() {
  await smokeFixtures();
  await smokeServer();
  if (failures > 0) {
    console.error(`\n[smoke] 失败 ${failures} 项，退出码 1`);
    process.exit(1);
  }
  console.log('\n[smoke] 全部通过，退出码 0');
}

main().catch((err) => {
  console.error('[smoke] 异常：', err);
  process.exit(1);
});
