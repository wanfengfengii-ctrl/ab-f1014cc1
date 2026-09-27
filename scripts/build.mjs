// 零依赖前端构建：把站点静态资源汇总到 dist/，并生成构建清单。
// Docker 的 verify 阶段与 compose 的 verify 服务都会执行本脚本。
import { cp, mkdir, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const ASSETS = ['index.html', 'styles.css', 'src'];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

async function main() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  for (const a of ASSETS) {
    await cp(path.join(root, a), path.join(dist, a), { recursive: true });
  }
  const files = await walk(dist);
  const manifest = {
    name: 'mosaic-mesh-verifier',
    builtAt: new Date().toISOString(),
    assets: {},
  };
  for (const f of files) {
    const rel = path.relative(dist, f).split(path.sep).join('/');
    const buf = await readFile(f);
    manifest.assets[rel] = createHash('sha256').update(buf).digest('hex').slice(0, 16);
  }
  await writeFile(path.join(dist, 'build-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`[build] 已输出 ${files.length + 1} 个文件到 dist/`);
  for (const rel of Object.keys(manifest.assets).sort()) console.log(`  - ${rel}`);
}

main().catch((err) => {
  console.error('[build] 失败：', err);
  process.exit(1);
});
