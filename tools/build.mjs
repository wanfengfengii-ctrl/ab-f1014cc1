// 前端构建：把 web/ 静态资源与 src/ 中被浏览器复用的核心模块
// 汇总到 dist/，并生成构建清单。无第三方依赖。

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const copies = [
  [join(root, 'web', 'index.html'), join(dist, 'index.html')],
  [join(root, 'web', 'styles.css'), join(dist, 'assets', 'styles.css')],
  [join(root, 'web', 'app.mjs'), join(dist, 'assets', 'app.mjs')],
  [join(root, 'src', 'geometry.mjs'), join(dist, 'assets', 'geometry.mjs')],
  [join(root, 'src', 'verify.mjs'), join(dist, 'assets', 'verify.mjs')],
  [join(root, 'src', 'parse.mjs'), join(dist, 'assets', 'parse.mjs')],
  [join(root, 'src', 'fixtures.mjs'), join(dist, 'assets', 'fixtures.mjs')],
];

await rm(dist, { recursive: true, force: true });
for (const [, dest] of copies) {
  await mkdir(dirname(dest), { recursive: true });
}
for (const [src, dest] of copies) {
  await cp(src, dest);
}

const manifest = {
  builtAt: new Date().toISOString(),
  files: copies.map(([, dest]) => dest.replace(`${dist}/`, '')),
};
await writeFile(join(dist, 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`构建完成：${manifest.files.length} 个文件 -> dist/`);
