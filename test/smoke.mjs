// 业务冒烟：
// 1) 启动构建产物上的静态服务器，确认 /healthz 与首页可用；
// 2) 载入一份有效网格，必须通过；
// 3) 载入一份边交叉网格，必须以 EDGE_CROSS 拒绝。
// 任一失败即以非零退出码报告。

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { verifyMesh } from '../src/verify.mjs';
import { parsePoints, parseTriangles } from '../src/parse.mjs';
import { validMesh, crossingMesh } from '../src/fixtures.mjs';

const PORT = process.env.SMOKE_WEB_PORT || 8911;
let failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  ✗ ${name}\n    ${err.message}`);
  }
}

async function waitForServer(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch { /* 尚未就绪，重试 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`静态服务器在 ${timeoutMs}ms 内未就绪：${url}`);
}

async function main() {
  console.log('冒烟 1：静态服务健康检查');
  const server = spawn(process.execPath, ['server.mjs'], {
    env: { ...process.env, WEB_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    const health = await waitForServer(`http://127.0.0.1:${PORT}/healthz`);
    const body = await health.json();
    assert.equal(body.status, 'ok');
    console.log('  ✓ GET /healthz 返回 200 且状态为 ok');

    const index = await fetch(`http://127.0.0.1:${PORT}/`);
    assert.equal(index.status, 200);
    const html = await index.text();
    assert.ok(html.includes('三角网核验'), '首页应包含应用标题');
    console.log('  ✓ GET / 返回首页');

    const assets = [
      '/assets/app.mjs',
      '/assets/verify.mjs',
      '/assets/geometry.mjs',
      '/assets/parse.mjs',
      '/assets/fixtures.mjs',
    ];
    for (const a of assets) {
      const res = await fetch(`http://127.0.0.1:${PORT}${a}`);
      assert.equal(res.status, 200, `${a} 应可访问`);
    }
    console.log('  ✓ 前端模块资源全部可访问');
  } catch (err) {
    failures += 1;
    console.error(`  ✗ 静态服务检查失败：${err.message}`);
  } finally {
    server.kill('SIGTERM');
    await once(server, 'exit').catch(() => {});
  }

  console.log('冒烟 2：载入有效网格');
  {
    const { points, errors: e1 } = parsePoints(validMesh.pointsText);
    const { triangles, errors: e2 } = parseTriangles(validMesh.trianglesText);
    assert.deepEqual(e1, []);
    assert.deepEqual(e2, []);
    const r = verifyMesh(points, triangles);
    check('有效网格必须核验通过', () => assert.ok(r.ok, r.error?.message));
    check('有效网格边界为单一闭环 1→2→3→4', () => {
      assert.deepEqual(r.data?.boundaryLoop, [1, 2, 3, 4]);
    });
  }

  console.log('冒烟 3：载入边交叉网格');
  {
    const { points } = parsePoints(crossingMesh.pointsText);
    const { triangles } = parseTriangles(crossingMesh.trianglesText);
    const r = verifyMesh(points, triangles);
    check('交叉网格必须被拒绝', () => assert.equal(r.ok, false));
    check('首项风险证据为不共端边交叉 (EDGE_CROSS)', () => {
      assert.equal(r.error?.code, 'EDGE_CROSS');
    });
    if (r.error) console.log(`    证据：${r.error.message}`);
  }

  // 确认构建产物中的模块也能被 Node 直接载入（防止构建漏拷）
  console.log('冒烟 4：构建产物完整性');
  {
    const distVerify = await import(pathToFileURL(`${process.cwd()}/dist/assets/verify.mjs`));
    const r = distVerify.verifyMesh(
      [
        { id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 0 },
        { id: 3, x: 1, y: 1 }, { id: 4, x: 0, y: 1 },
      ],
      [[1, 2, 3], [1, 3, 4]],
    );
    check('dist 产物中的核验器可独立运行', () => assert.ok(r.ok, r.error?.message));
  }

  if (failures > 0) {
    console.error(`\n冒烟失败：${failures} 项`);
    process.exit(1);
  }
  console.log('\n全部冒烟通过');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
