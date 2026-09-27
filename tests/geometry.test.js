import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateMesh,
  orient,
  onSegment,
  segmentsIntersect,
  trianglesOverlap,
} from '../src/geometry.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const loadFixture = async (name) =>
  JSON.parse(await readFile(path.join(here, '..', 'fixtures', name), 'utf8'));

const P = (id, x, y) => ({ id, x, y });

test('有效夹具：通过且边界环为 1→2→3→4 的唯一闭环', async () => {
  const fx = await loadFixture('valid.json');
  const r = validateMesh(fx.points, fx.triangles);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.triangles.length, 4);
  assert.equal(r.edges.length, 8); // 4 边界 + 4 内部
  assert.deepEqual(r.boundaryLoop, [1, 2, 3, 4]);
  assert.deepEqual(r.boundaryEdgeKeys, ['1_2', '2_3', '3_4', '1_4']);
});

test('交叉夹具：在阶段6按边录入顺序报告首个交叉', async () => {
  const fx = await loadFixture('crossing.json');
  const r = validateMesh(fx.points, fx.triangles);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'EDGE_CROSSING');
  assert.deepEqual(r.evidence.edge1, [2, 3]);
  assert.deepEqual(r.evidence.edge2, [4, 5]);
});

test('几何小函数：定向、共线、相切', () => {
  assert.ok(orient(P(1, 0, 0), P(2, 4, 0), P(3, 0, 4)) > 0);
  assert.ok(orient(P(1, 0, 0), P(2, 0, 4), P(3, 4, 0)) < 0);
  assert.equal(orient(P(1, 0, 0), P(2, 4, 0), P(3, 2, 0)), 0);
  assert.ok(onSegment(P(1, 0, 0), P(2, 4, 0), P(9, 2, 0)));
  assert.ok(!onSegment(P(1, 0, 0), P(2, 4, 0), P(9, 5, 0)));
  // T 接式相切：一条边端点落在另一条边内部
  assert.ok(segmentsIntersect(P(1, 0, 0), P(2, 4, 0), P(3, 2, 0), P(4, 2, 3)));
  // 共线重叠
  assert.ok(segmentsIntersect(P(1, 0, 0), P(2, 4, 0), P(3, 1, 0), P(4, 3, 0)));
  // 正常不相交
  assert.ok(!segmentsIntersect(P(1, 0, 0), P(2, 4, 0), P(3, 0, 1), P(4, 4, 1)));
});

test('阶段0：测点数量必须 4–20', () => {
  const pts = [P(1, 0, 0), P(2, 1, 0), P(3, 0, 1)];
  const r = validateMesh(pts, [[1, 2, 3]]);
  assert.equal(r.code, 'INVALID_POINT_COUNT');
});

test('阶段0：编号唯一 / 坐标整数 / 坐标不重合', () => {
  let r = validateMesh(
    [P(1, 0, 0), P(1, 4, 0), P(2, 0, 4), P(3, 5, 5)],
    [[1, 2, 3]],
  );
  assert.equal(r.code, 'DUPLICATE_POINT_ID');

  r = validateMesh(
    [{ id: 1, x: 0.5, y: 0 }, P(2, 4, 0), P(3, 0, 4), P(4, 5, 5)],
    [[1, 2, 3]],
  );
  assert.equal(r.code, 'NON_INTEGER_COORD');

  r = validateMesh(
    [P(1, 0, 0), P(2, 4, 0), P(3, 0, 4), P(4, 0, 0)],
    [[1, 2, 3]],
  );
  assert.equal(r.code, 'DUPLICATE_COORD');
});

test('阶段0：顶点必须引用存在的测点', () => {
  const r = validateMesh(
    [P(1, 0, 0), P(2, 4, 0), P(3, 0, 4), P(4, 5, 5)],
    [[1, 2, 9]],
  );
  assert.equal(r.code, 'UNKNOWN_VERTEX');
  assert.equal(r.evidence.vertex, 9);
});

test('阶段1：顺时针与退化三角形被拒', () => {
  const pts = [P(1, 0, 0), P(2, 4, 0), P(3, 4, 4), P(4, 0, 4)];
  let r = validateMesh(pts, [[1, 3, 2]]); // 顺时针
  assert.equal(r.code, 'NOT_CCW');
  assert.ok(r.evidence.area2 < 0);

  r = validateMesh([P(1, 0, 0), P(2, 4, 0), P(3, 2, 0), P(4, 0, 4)], [[1, 2, 3]]);
  assert.equal(r.code, 'NOT_CCW');
  assert.equal(r.evidence.area2, 0);
});

test('阶段2：边被 3 个面使用时按首次录入边报告', () => {
  const pts = [
    P(1, 0, 0), P(2, 4, 0), P(3, 4, 4), P(4, 0, 4),
    P(5, 2, 2), P(6, 2, -2), P(7, 1, -1),
  ];
  const tris = [[1, 2, 5], [2, 3, 5], [3, 4, 5], [4, 1, 5], [2, 1, 6], [2, 1, 7]];
  const r = validateMesh(pts, tris);
  assert.equal(r.code, 'EDGE_OVERUSED');
  assert.deepEqual(r.evidence.edge, [1, 2]);
  assert.deepEqual(r.evidence.faces, [0, 4, 5]);
});

test('阶段3：内部边两面同侧（折叠）被拒', () => {
  const pts = [P(1, 0, 0), P(2, 4, 0), P(3, 1, 3), P(4, 3, 3)];
  const r = validateMesh(pts, [[1, 2, 3], [1, 2, 4]]);
  assert.equal(r.code, 'INTERNAL_EDGE_SAME_SIDE');
  assert.deepEqual(r.evidence.edge, [1, 2]);
});

test('阶段7：边界顶点度数不为 2（破口/分叉）被拒', () => {
  const pts = [P(1, 0, 0), P(2, 4, 0), P(3, 2, 3), P(4, -2, 3), P(5, -4, 0)];
  const r = validateMesh(pts, [[1, 2, 3], [1, 4, 5]]);
  assert.equal(r.code, 'BOUNDARY_VERTEX_DEGREE');
  assert.equal(r.evidence.vertex, 1);
  assert.equal(r.evidence.degree, 4);
});

test('阶段7：边界分成多个闭环时被拒', () => {
  const pts = [P(1, 0, 0), P(2, 4, 0), P(3, 2, 3), P(4, 10, 0), P(5, 14, 0), P(6, 12, 3)];
  const r = validateMesh(pts, [[1, 2, 3], [4, 5, 6]]);
  assert.equal(r.code, 'BOUNDARY_DISCONNECTED');
});

test('阶段4：顶点落在非关联边上被拒', () => {
  const pts = [P(1, 0, 0), P(2, 4, 0), P(3, 4, 4), P(4, 0, 4), P(5, 2, 0)];
  const r = validateMesh(pts, [[1, 2, 3], [1, 3, 4]]);
  assert.equal(r.code, 'VERTEX_ON_EDGE');
  assert.equal(r.evidence.vertex, 5);
  assert.deepEqual(r.evidence.edge, [1, 2]);
});

test('阶段6：包含式内部重叠被拒（边不交叉也能发现）', () => {
  const pts = [P(1, 0, 0), P(2, 8, 0), P(3, 4, 8), P(4, 4, 2), P(5, 3, 5), P(6, 5, 5)];
  const r = validateMesh(pts, [[1, 2, 3], [4, 6, 5]]);
  assert.equal(r.code, 'TRIANGLE_OVERLAP');
  assert.deepEqual(r.evidence.triangles, [0, 1]);
  assert.equal(r.evidence.vertex, 4);
});

test('trianglesOverlap：相同顶点集判定为完全重叠', () => {
  const byId = new Map([P(1, 0, 0), P(2, 4, 0), P(3, 0, 4)].map((p) => [p.id, p]));
  assert.deepEqual(trianglesOverlap([1, 2, 3], [2, 3, 1], byId), { vertex: 1, identical: true });
  assert.equal(trianglesOverlap([1, 2, 3], [1, 2, 3], byId).identical, true);
});

test('合法的非凸（凹）四边形扇面可以通过', () => {
  // 凹四边形 1(0,0) 2(4,0) 3(1,1) 4(0,4)，沿 1-3 对角剖分
  const pts = [P(1, 0, 0), P(2, 4, 0), P(3, 1, 1), P(4, 0, 4)];
  const r = validateMesh(pts, [[1, 2, 3], [1, 3, 4]]);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.boundaryLoop, [1, 2, 3, 4]);
});

test('失败结果仍携带到当前阶段为止的边表与三角形表', () => {
  const fx = {
    points: [P(1, 0, 0), P(2, 4, 0), P(3, 0, 4), P(4, 5, 5)],
    triangles: [[1, 3, 2]],
  };
  const r = validateMesh(fx.points, fx.triangles);
  assert.equal(r.ok, false);
  assert.equal(r.triangles.length, 1);
  assert.equal(r.edges.length, 3);
});
