import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyMesh } from '../src/verify.mjs';
import { parsePoints, parseTriangles } from '../src/parse.mjs';
import {
  cross,
  pointInOpenSegment,
  nonIncidentEdgeContact,
  pointStrictlyInsideTriangle,
} from '../src/geometry.mjs';
import { validMesh, crossingMesh } from '../src/fixtures.mjs';

function run(points, triangles) {
  return verifyMesh(points, triangles.map((t) => t.map(Number)));
}

// 两个拼在一起的单位正方形：四个三角形，严格逆时针
const SQUARE_POINTS = [
  { id: 1, x: 0, y: 0 },
  { id: 2, x: 2, y: 0 },
  { id: 3, x: 2, y: 2 },
  { id: 4, x: 0, y: 2 },
  { id: 5, x: 1, y: 1 },
];
const SQUARE_TRIS = [
  [1, 2, 5],
  [2, 3, 5],
  [3, 4, 5],
  [4, 1, 5],
];

test('夹具：有效网格通过核验', () => {
  const { points } = parsePoints(validMesh.pointsText);
  const { triangles } = parseTriangles(validMesh.trianglesText);
  const r = verifyMesh(points, triangles);
  assert.ok(r.ok, r.error?.message);
  assert.deepEqual(r.data.boundaryLoop, [1, 2, 3, 4]);
  const internal = r.data.edges.filter((e) => e.faces.length === 2);
  assert.equal(internal.length, 4);
  const boundary = r.data.edges.filter((e) => e.faces.length === 1);
  assert.equal(boundary.length, 4);
});

test('夹具：交叉网格被拒绝，首项证据为不共端边交叉', () => {
  const { points } = parsePoints(crossingMesh.pointsText);
  const { triangles } = parseTriangles(crossingMesh.trianglesText);
  const r = verifyMesh(points, triangles);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'EDGE_CROSS');
  assert.deepEqual([r.error.edgeIndex + 1, r.error.edgeIndex2 + 1], [2, 4]);
});

test('合法的双正方形网格通过，边界为单环', () => {
  const r = run(SQUARE_POINTS, SQUARE_TRIS);
  assert.ok(r.ok, r.error?.message);
  assert.deepEqual(r.data.boundaryLoop, [1, 2, 3, 4]);
});

test('测点数量必须在 4 到 20 之间', () => {
  const pts = [
    { id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 0 }, { id: 3, x: 0, y: 1 },
  ];
  assert.equal(run(pts, [[1, 2, 3]]).error.code, 'POINTS_RANGE');
});

test('测点编号必须唯一', () => {
  const pts = [
    { id: 1, x: 0, y: 0 }, { id: 1, x: 1, y: 0 },
    { id: 3, x: 0, y: 1 }, { id: 4, x: 2, y: 2 },
  ];
  assert.equal(run(pts, [[1, 3, 4]]).error.code, 'POINT_DUP_ID');
});

test('测点坐标不得重合', () => {
  const pts = [
    { id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 0 },
    { id: 3, x: 0, y: 1 }, { id: 4, x: 0, y: 0 },
  ];
  assert.equal(run(pts, [[1, 2, 3]]).error.code, 'POINT_DUP_COORD');
});

test('三角形引用未知编号被拒绝', () => {
  const r = run(SQUARE_POINTS, [[1, 2, 9]]);
  assert.equal(r.error.code, 'TRI_UNKNOWN_ID');
});

test('三角形顶点重复被拒绝', () => {
  const r = run(SQUARE_POINTS, [[1, 1, 2]]);
  assert.equal(r.error.code, 'TRI_DUP_VERTEX');
});

test('游离测点被拒绝', () => {
  const pts = [...SQUARE_POINTS, { id: 6, x: 9, y: 9 }];
  assert.equal(run(pts, SQUARE_TRIS).error.code, 'POINT_UNUSED');
});

test('退化三角形（三点共线）被拒绝', () => {
  const pts = [
    { id: 1, x: 0, y: 0 }, { id: 2, x: 2, y: 0 }, { id: 3, x: 5, y: 0 },
    { id: 4, x: 1, y: 1 }, { id: 5, x: 4, y: 2 },
  ];
  assert.equal(run(pts, [[1, 2, 3], [1, 2, 4], [2, 5, 4]]).error.code, 'TRI_DEGENERATE');
});

test('顺时针三角形按严格逆时针要求拒绝', () => {
  const pts = [
    { id: 1, x: 0, y: 0 }, { id: 2, x: 2, y: 0 },
    { id: 3, x: 2, y: 2 }, { id: 4, x: 0, y: 2 },
  ];
  // 全部测点都被引用，第一个三角形顶点顺序为顺时针
  const r = run(pts, [[2, 1, 3], [1, 3, 4]]);
  assert.equal(r.error.code, 'TRI_NOT_CCW');
  assert.equal(r.error.triangleIndex, 0);
});

test('边被三个面使用被拒绝', () => {
  const pts = [
    { id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 },
    { id: 5, x: 2, y: 2 }, { id: 6, x: 1, y: -1 },
    { id: 7, x: 3, y: -1 }, { id: 8, x: 2, y: -3 },
  ];
  // 三个严格逆时针三角形共用边 1-2：一个在北侧，两个在南侧
  const tris = [[1, 2, 5], [2, 1, 6], [1, 7, 2], [6, 8, 7]];
  const r = run(pts, tris);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'EDGE_OVERUSED');
});

test('内部边同侧（折面/重叠）被拒绝', () => {
  // 两个三角形共用 1-2 且第三顶点都在上侧（同侧重叠/折起）
  const pts = [
    { id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 },
    { id: 3, x: 1, y: 2 }, { id: 4, x: 3, y: 2 },
    { id: 5, x: 9, y: 9 },
  ];
  // 两面严格逆时针却同向穿过共享边，补充三角形让所有测点被使用
  const tris = [[1, 2, 3], [1, 2, 4], [3, 4, 5]];
  const r = run(pts, tris);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'EDGE_FOLD');
});

test('顶点落在非关联边内部被拒绝', () => {
  // 测点 5 位于边 1-2 内部但不属于该边所在三角形（结构上不可能合法）
  const pts = [
    { id: 1, x: 0, y: 0 }, { id: 2, x: 6, y: 0 }, { id: 3, x: 0, y: 6 },
    { id: 4, x: 6, y: 6 }, { id: 5, x: 3, y: 0 }, { id: 6, x: 3, y: 3 },
  ];
  // 1-2-3 大三角 + 2-4-3 + 一个引用 5 的小三角，使 1-2 仍是“非关联边”
  const tris = [[1, 2, 3], [2, 4, 3], [5, 4, 6]];
  const r = run(pts, tris);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'VERTEX_ON_EDGE');
});

test('不共端边相切（端点落在另一边上）首先报顶点落边', () => {
  const p1 = { id: 1, x: 0, y: 0 };
  const p2 = { id: 2, x: 6, y: 0 };
  const p3 = { id: 3, x: 0, y: 6 };
  const p4 = { id: 4, x: 3, y: 3 }; // 位于 2-3 上
  const p5 = { id: 5, x: 3, y: 6 };
  const p6 = { id: 6, x: 5, y: 5 };
  // 边 4-5 的端点 4 落在非关联边 2-3 上；
  // 顶点落边检查先于边对检查，因此首项证据为 VERTEX_ON_EDGE
  const r = run([p1, p2, p3, p4, p5, p6], [[1, 2, 3], [4, 6, 5]]);
  assert.equal(r.error.code, 'VERTEX_ON_EDGE');
  // 几何层面同样识别为相切
  assert.equal(
    nonIncidentEdgeContact(p2, p3, p4, p5),
    'touch',
  );
});

test('两个分离的闭环不是一块连续底图', () => {
  const pts = [
    { id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 0 }, { id: 3, x: 0, y: 1 },
    { id: 4, x: 5, y: 0 }, { id: 5, x: 6, y: 0 }, { id: 6, x: 5, y: 1 },
  ];
  const r = run(pts, [[1, 2, 3], [4, 5, 6]]);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'BOUNDARY_MULTIPLE');
});

test('两块网格仅以单点相接：边界在接点处分叉', () => {
  // A 正方形 1-2-3-4；B 正方形仅借顶点 4 相接
  const pts = [
    { id: 1, x: 0, y: 0 }, { id: 2, x: 2, y: 0 },
    { id: 3, x: 2, y: 2 }, { id: 4, x: 0, y: 2 },
    { id: 6, x: -2, y: 2 }, { id: 7, x: -2, y: 4 },
    { id: 8, x: 0, y: 4 },
  ];
  const tris = [[1, 2, 3], [1, 3, 4], [4, 7, 6], [4, 8, 7]];
  const r = run(pts, tris);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'BOUNDARY_BRANCH');
  assert.equal(r.error.pointId ?? 4, 4);
});

test('共线重叠边被拒绝', () => {
  const p1 = { x: 0, y: 0 }, p2 = { x: 4, y: 0 };
  const p3 = { x: 2, y: 0 }, p4 = { x: 6, y: 0 };
  assert.equal(nonIncidentEdgeContact(p1, p2, p3, p4), 'overlap');
});

test('凹四边形扇形（少一块但仍是单连通盘）合法闭环', () => {
  const pts = [
    { id: 1, x: 0, y: 0 }, { id: 2, x: 2, y: 0 }, { id: 3, x: 2, y: 2 },
    { id: 4, x: 0, y: 2 }, { id: 5, x: 1, y: 1 },
  ];
  const tris = [[1, 2, 5], [2, 3, 5], [3, 4, 5]];
  const r = run(pts, tris);
  assert.ok(r.ok, r.error?.message);
  assert.deepEqual(r.data.boundaryLoop, [1, 2, 3, 4, 5]);
});

test('小三角形整个位于大三角形内部（边不交叉）按内部重叠拒绝', () => {
  const pts = [
    { id: 1, x: 0, y: 0 }, { id: 2, x: 10, y: 0 }, { id: 3, x: 0, y: 10 },
    { id: 4, x: 2, y: 1 }, { id: 5, x: 1, y: 1 }, { id: 6, x: 1, y: 2 },
  ];
  const r = run(pts, [[1, 2, 3], [4, 6, 5]]);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'TRI_OVERLAP');
});

test('解析器：错误行被收集且支持注释与中文逗号', () => {
  const text = '# 注释\n1 0 0\n2，1，0\n坏行\n3 0 1';
  const { points, errors } = parsePoints(text);
  assert.equal(points.length, 3);
  assert.ok(errors.some((e) => e.includes('坏行')));
});

test('几何工具：BigInt 叉积与点在开线段内', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 10 };
  assert.equal(cross(a, b, { x: 1, y: 2 }) > 0n, true);
  assert.equal(pointInOpenSegment(a, b, { x: 5, y: 5 }), true);
  assert.equal(pointInOpenSegment(a, b, { x: 0, y: 0 }), false);
  assert.equal(pointInOpenSegment(a, b, { x: 11, y: 11 }), false);
});

test('几何工具：点严格位于三角形内部', () => {
  const pts = new Map([
    [1, { x: 0, y: 0 }], [2, { x: 6, y: 0 }], [3, { x: 0, y: 6 }],
  ]);
  assert.equal(pointStrictlyInsideTriangle({ x: 1, y: 1 }, [1, 2, 3], pts), true);
  assert.equal(pointStrictlyInsideTriangle({ x: 3, y: 3 }, [1, 2, 3], pts), false); // 边上
  assert.equal(pointStrictlyInsideTriangle({ x: 7, y: 7 }, [1, 2, 3], pts), false);
});
