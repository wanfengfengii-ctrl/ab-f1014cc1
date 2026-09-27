import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePointsText, parseTrianglesText } from '../src/parser.js';
import { validateMesh } from '../src/geometry.js';
import { validSample, crossingSample } from '../src/samples.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

// 浏览器无法直接 import JSON，内置示例以文本存放在 src/samples.js；
// 本测试守护其与 fixtures/*.json 完全一致。
test('浏览器内置示例与 fixtures 一致且核验结论正确', async () => {
  const valid = JSON.parse(await readFile(path.join(root, 'fixtures', 'valid.json'), 'utf8'));
  const vPts = parsePointsText(validSample.pointsText);
  const vTris = parseTrianglesText(validSample.trianglesText);
  assert.equal(vPts.error, undefined);
  assert.equal(vTris.error, undefined);
  assert.deepEqual(vPts.data, valid.points);
  assert.deepEqual(vTris.data, valid.triangles);
  const rv = validateMesh(vPts.data, vTris.data);
  assert.equal(rv.ok, true, rv.message);

  const crossing = JSON.parse(await readFile(path.join(root, 'fixtures', 'crossing.json'), 'utf8'));
  const cPts = parsePointsText(crossingSample.pointsText);
  const cTris = parseTrianglesText(crossingSample.trianglesText);
  assert.equal(cPts.error, undefined);
  assert.equal(cTris.error, undefined);
  assert.deepEqual(cPts.data, crossing.points);
  assert.deepEqual(cTris.data, crossing.triangles);
  const rc = validateMesh(cPts.data, cTris.data);
  assert.equal(rc.ok, false);
  assert.equal(rc.code, 'EDGE_CROSSING');
});
