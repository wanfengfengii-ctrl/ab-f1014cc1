/**
 * 三角网几何核验核心（纯函数模块，浏览器与 Node 共用）。
 *
 * 输入：
 *   points    — [{ id, x, y }]，4–20 个测点，编号唯一，整数坐标
 *   triangles — [[idA,idB,idC], ...] 或 [{ verts:[idA,idB,idC] }, ...]
 *
 * 输出（成功）：
 *   { ok:true, message, triangles, edges, boundaryLoop, boundaryEdgeKeys }
 * 输出（失败）：
 *   { ok:false, code, message, evidence, triangles?, edges? }
 *
 * 核验按固定阶段进行，任一阶段失败即返回；
 * 几何干涉阶段按“边 / 三角形的录入顺序”报告首项证据：
 *   阶段0 录入结构（点数、编号唯一、整数坐标、坐标不重合、顶点引用存在）
 *   阶段1 每个三角形严格逆时针（有向面积 ×2 > 0）
 *   阶段2 每条边恰被 1 或 2 个面使用
 *   阶段3 内部边（2 面共用）的两面分居边的两侧
 *   阶段4 顶点不落在非关联边上（按边首次录入顺序）
 *   阶段5 不共端边不交叉、不相切（按边首次录入顺序）
 *   阶段6 三角形内部互不重叠（按三角形录入顺序）
 *   阶段7 全部边界边按唯一顺序组成一个简单闭环
 *          （阶段4–6 通过后，度数为 2 且连通的边界环在几何上必简单）
 */

const MAX_COORD = 1_000_000; // 限制坐标范围，保证叉积在 2^53 内精确

/** 有向面积 ×2：>0 表示 a→b→c 逆时针，=0 共线，<0 顺时针 */
export function orient(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** p 是否落在线段 ab 上（含端点），调用前需保证坐标为整数 */
export function onSegment(a, b, p) {
  return (
    orient(a, b, p) === 0 &&
    Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y)
  );
}

/** 线段 p1p2 与 p3p4 是否相交（含交叉、相切、共线重叠） */
export function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) return true;
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;
  return false;
}

/** 点是否严格位于逆时针三角形内部 */
function strictlyInsideTriangle(p, a, b, c) {
  return orient(a, b, p) > 0 && orient(b, c, p) > 0 && orient(c, a, p) > 0;
}

/**
 * 两个严格逆时针三角形（顶点编号数组 + id→点 映射）内部是否重叠。
 * 返回 null 表示不重叠；否则返回 { vertex, identical }。
 * 导出供单元测试直接使用。
 */
export function trianglesOverlap(t1Verts, t2Verts, byId) {
  const s1 = [...t1Verts].sort((x, y) => x - y).join(',');
  const s2 = [...t2Verts].sort((x, y) => x - y).join(',');
  if (s1 === s2) return { vertex: t1Verts[0], identical: true };
  const [a1, b1, c1] = t1Verts.map((id) => byId.get(id));
  const [a2, b2, c2] = t2Verts.map((id) => byId.get(id));
  for (const id of t1Verts) {
    if (strictlyInsideTriangle(byId.get(id), a2, b2, c2)) return { vertex: id, identical: false };
  }
  for (const id of t2Verts) {
    if (strictlyInsideTriangle(byId.get(id), a1, b1, c1)) return { vertex: id, identical: false };
  }
  return null;
}

export function validateMesh(pointsInput, trianglesInput) {
  const points = Array.isArray(pointsInput) ? pointsInput : [];
  const trianglesIn = Array.isArray(trianglesInput) ? trianglesInput : [];
  const fail = (code, message, evidence = {}, extra = {}) =>
    ({ ok: false, code, message, evidence, ...extra });

  // ---- 阶段 0：录入结构 ----
  if (points.length < 4 || points.length > 20) {
    return fail('INVALID_POINT_COUNT', `测点数量须为 4–20 个，当前 ${points.length} 个`);
  }
  const byId = new Map();
  for (let i = 0; i < points.length; i++) {
    const p = points[i] || {};
    if (!Number.isInteger(p.id)) {
      return fail('INVALID_POINT_ID', `第 ${i + 1} 行测点编号缺失或不是整数`, { row: i });
    }
    if (byId.has(p.id)) {
      return fail('DUPLICATE_POINT_ID', `测点编号 ${p.id} 重复`, { pointId: p.id });
    }
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) {
      return fail('NON_INTEGER_COORD', `测点 ${p.id} 的坐标必须是整数`, { pointId: p.id });
    }
    if (Math.abs(p.x) > MAX_COORD || Math.abs(p.y) > MAX_COORD) {
      return fail('COORD_OUT_OF_RANGE', `测点 ${p.id} 的坐标超出 ±${MAX_COORD} 范围`, { pointId: p.id });
    }
    byId.set(p.id, { id: p.id, x: p.x, y: p.y });
  }
  const byCoord = new Map();
  for (const p of byId.values()) {
    const k = `${p.x},${p.y}`;
    if (byCoord.has(k)) {
      return fail('DUPLICATE_COORD', `测点 ${byCoord.get(k)} 与 ${p.id} 坐标重合（${k}）`,
        { points: [byCoord.get(k), p.id] });
    }
    byCoord.set(k, p.id);
  }
  if (trianglesIn.length < 1) {
    return fail('NO_TRIANGLES', '至少录入 1 个三角形');
  }
  const tris = [];
  for (let i = 0; i < trianglesIn.length; i++) {
    const t = trianglesIn[i];
    const verts = Array.isArray(t) ? t : t && t.verts;
    if (!Array.isArray(verts) || verts.length !== 3) {
      return fail('INVALID_TRIANGLE', `三角形 T${i + 1} 须含 3 个顶点编号`, { triangle: i });
    }
    for (const v of verts) {
      if (!Number.isInteger(v) || !byId.has(v)) {
        return fail('UNKNOWN_VERTEX', `三角形 T${i + 1} 的顶点编号无效或引用了不存在的测点：${v}`,
          { triangle: i, vertex: v });
      }
    }
    tris.push({ index: i, verts: [verts[0], verts[1], verts[2]] });
  }

  // ---- 边表（按首次录入顺序）尽早建立，任何失败都能展示相邻面 ----
  const edges = [];
  const edgeByKey = new Map();
  const keyOf = (u, v) => (u < v ? `${u}_${v}` : `${v}_${u}`);
  for (const t of tris) {
    const [a, b, c] = t.verts;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = keyOf(u, v);
      let e = edgeByKey.get(k);
      if (!e) {
        e = { key: k, a: Math.min(u, v), b: Math.max(u, v), faces: [] };
        edgeByKey.set(k, e);
        edges.push(e);
      }
      e.faces.push(t.index);
    }
  }
  const withMesh = () => ({ triangles: tris, edges });

  // ---- 阶段 1：严格逆时针 ----
  for (const t of tris) {
    const [a, b, c] = t.verts.map((id) => byId.get(id));
    t.area2 = orient(a, b, c);
    if (t.area2 <= 0) {
      return fail('NOT_CCW',
        `三角形 T${t.index + 1}（${t.verts.join('-')}）不是严格逆时针（有向面积×2 = ${t.area2}）`,
        { triangle: t.index, verts: [...t.verts], area2: t.area2 },
        withMesh());
    }
  }

  // ---- 阶段 2：每条边恰被 1 或 2 个面使用 ----
  for (const e of edges) {
    if (e.faces.length > 2) {
      return fail('EDGE_OVERUSED',
        `边 ${e.a}-${e.b} 被 ${e.faces.length} 个三角形使用（${e.faces.map((i) => 'T' + (i + 1)).join('、')}），每条边至多属于 2 个面`,
        { edge: [e.a, e.b], faces: [...e.faces] }, withMesh());
    }
  }

  // ---- 阶段 3：内部边两面分居两侧 ----
  for (const e of edges) {
    if (e.faces.length !== 2) continue;
    const [f1, f2] = e.faces;
    const o1 = tris[f1].verts.find((v) => v !== e.a && v !== e.b);
    const o2 = tris[f2].verts.find((v) => v !== e.a && v !== e.b);
    const A = byId.get(e.a);
    const B = byId.get(e.b);
    const s1 = orient(A, B, byId.get(o1));
    const s2 = orient(A, B, byId.get(o2));
    if (s1 * s2 >= 0) {
      return fail('INTERNAL_EDGE_SAME_SIDE',
        `内部边 ${e.a}-${e.b} 的两面 T${f1 + 1}、T${f2 + 1} 位于同侧，网格在此折叠或重叠，无法共面`,
        { edge: [e.a, e.b], faces: [f1, f2] }, withMesh());
    }
  }

  // ---- 阶段 4：顶点不落在非关联边上（按边首次录入顺序） ----
  for (const e of edges) {
    const A = byId.get(e.a);
    const B = byId.get(e.b);
    for (const p of byId.values()) {
      if (p.id === e.a || p.id === e.b) continue;
      if (onSegment(A, B, p)) {
        return fail('VERTEX_ON_EDGE',
          `测点 ${p.id} 落在非关联边 ${e.a}-${e.b} 上`,
          { vertex: p.id, edge: [e.a, e.b] }, withMesh());
      }
    }
  }

  // ---- 阶段 5：不共端边不交叉、不相切（按边首次录入顺序） ----
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e1 = edges[i];
      const e2 = edges[j];
      if (e1.a === e2.a || e1.a === e2.b || e1.b === e2.a || e1.b === e2.b) continue;
      if (segmentsIntersect(byId.get(e1.a), byId.get(e1.b), byId.get(e2.a), byId.get(e2.b))) {
        return fail('EDGE_CROSSING',
          `不共端边 ${e1.a}-${e1.b} 与 ${e2.a}-${e2.b} 交叉或相切`,
          { edge1: [e1.a, e1.b], edge2: [e2.a, e2.b] }, withMesh());
      }
    }
  }

  // ---- 阶段 6：三角形内部互不重叠（按三角形录入顺序） ----
  for (let i = 0; i < tris.length; i++) {
    for (let j = i + 1; j < tris.length; j++) {
      const hit = trianglesOverlap(tris[i].verts, tris[j].verts, byId);
      if (hit) {
        return fail('TRIANGLE_OVERLAP',
          hit.identical
            ? `三角形 T${i + 1} 与 T${j + 1} 顶点集相同，内部完全重叠`
            : `三角形 T${i + 1} 与 T${j + 1} 内部重叠（测点 ${hit.vertex} 落在对方内部）`,
          { triangles: [i, j], vertex: hit.vertex }, withMesh());
      }
    }
  }

  // ---- 阶段 7：边界边按唯一顺序组成一个简单闭环 ----
  const boundary = edges.filter((e) => e.faces.length === 1);
  if (boundary.length === 0) {
    return fail('BOUNDARY_EMPTY', '没有边界边：网格封闭成体，无法作为平面拼补底图', {}, withMesh());
  }
  const deg = new Map();
  for (const e of boundary) {
    deg.set(e.a, (deg.get(e.a) || 0) + 1);
    deg.set(e.b, (deg.get(e.b) || 0) + 1);
  }
  for (const e of boundary) {
    for (const v of [e.a, e.b]) {
      if (deg.get(v) !== 2) {
        return fail('BOUNDARY_VERTEX_DEGREE',
          `边界顶点 ${v} 连接 ${deg.get(v)} 条边界边（应为 2），边界存在破口或分叉`,
          { vertex: v, degree: deg.get(v) }, withMesh());
      }
    }
  }
  const adj = new Map();
  for (const e of boundary) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push(e);
    adj.get(e.b).push(e);
  }
  const start = boundary[0];
  const visited = new Set([start.key]);
  const loop = [start.a, start.b];
  let prevKey = start.key;
  let cur = start.b;
  while (cur !== start.a) {
    const next = adj.get(cur).find((e) => e.key !== prevKey);
    if (!next) break; // 防御：度数检查已保证存在
    visited.add(next.key);
    cur = next.a === cur ? next.b : next.a;
    loop.push(cur);
    prevKey = next.key;
  }
  loop.pop(); // 末尾回到起点，去掉重复顶点
  if (visited.size !== boundary.length) {
    const rest = boundary.find((e) => !visited.has(e.key));
    return fail('BOUNDARY_DISCONNECTED',
      `边界边无法按唯一顺序组成一个简单闭环：从边 ${start.a}-${start.b} 出发只能串联 ${visited.size}/${boundary.length} 条边界边（存在断口或多个独立环）`,
      { edge: [rest.a, rest.b] }, withMesh());
  }

  // ---- 通过 ----
  return {
    ok: true,
    message: `核验通过：${tris.length} 个三角形严格逆时针，${edges.length} 条边相邻关系正常，${boundary.length} 条边界边组成唯一简单闭环`,
    triangles: tris,
    edges,
    boundaryLoop: loop,
    boundaryEdgeKeys: boundary.map((e) => e.key),
  };
}
