// 整数坐标点的纯整数几何工具。
// 全部比较使用 BigInt，避免浮点误差；坐标本身允许为整数。

export function toBig(x) {
  if (typeof x === 'bigint') return x;
  return BigInt(x);
}

// 叉积 (b-a) x (c-a)
export function cross(a, b, c) {
  return (toBig(b.x) - toBig(a.x)) * (toBig(c.y) - toBig(a.y))
    - (toBig(b.y) - toBig(a.y)) * (toBig(c.x) - toBig(a.x));
}

function bi(v) {
  return { x: toBig(v.x), y: toBig(v.y) };
}

function bbox(p, q) {
  return {
    minX: p.x < q.x ? p.x : q.x,
    maxX: p.x > q.x ? p.x : q.x,
    minY: p.y < q.y ? p.y : q.y,
    maxY: p.y > q.y ? p.y : q.y,
  };
}

function inBox(box, p) {
  return p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
}

// 判断开线段 (a,b)（不含端点）是否经过点 p。调用前 p 不在 {a,b}。
export function pointInOpenSegment(a, b, p) {
  if (cross(a, b, p) !== 0n) return false;
  return inBox(bbox(bi(a), bi(b)), bi(p))
    && !(toBig(p.x) === toBig(a.x) && toBig(p.y) === toBig(a.y))
    && !(toBig(p.x) === toBig(b.x) && toBig(p.y) === toBig(b.y));
}

// 判断两条互不共端的线段是否在内部相交。
// 返回 'cross'（交叉）、'touch'（端点落在另一边上的相切）、
// 'overlap'（共线重叠）或 null（无接触）。
export function nonIncidentEdgeContact(a, b, c, d) {
  const A = bi(a); const B = bi(b); const C = bi(c); const D = bi(d);
  const c1 = cross(A, B, C);
  const c2 = cross(A, B, D);
  const c3 = cross(C, D, A);
  const c4 = cross(C, D, B);

  // 严格跨立：交叉。
  if (((c1 > 0n && c2 < 0n) || (c1 < 0n && c2 > 0n))
    && ((c3 > 0n && c4 < 0n) || (c3 < 0n && c4 > 0n))) {
    return 'cross';
  }

  // 四点共线：包围盒相交即存在重叠。
  if (c1 === 0n && c2 === 0n && c3 === 0n && c4 === 0n) {
    const b1 = bbox(A, B);
    const b2 = bbox(C, D);
    const disjoint = b1.maxX < b2.minX || b2.maxX < b1.minX
      || b1.maxY < b2.minY || b2.maxY < b1.minY;
    return disjoint ? null : 'overlap';
  }

  // 相切：c/d 中某点落在 (a,b) 开段上，或 a/b 中某点落在 (c,d) 开段上。
  if (pointInOpenSegment(A, B, C)) return 'touch';
  if (pointInOpenSegment(A, B, D)) return 'touch';
  if (pointInOpenSegment(C, D, A)) return 'touch';
  if (pointInOpenSegment(C, D, B)) return 'touch';

  return null;
}

// 判断点 p 是否严格位于三角形 t 内部（不含边界）。
// at: 以测点编号为键的坐标 Map。
export function pointStrictlyInsideTriangle(p, t, at) {
  const a = bi(at.get(t[0]));
  const b = bi(at.get(t[1]));
  const c = bi(at.get(t[2]));
  const P = bi(p);
  const d1 = cross(a, b, P);
  const d2 = cross(b, c, P);
  const d3 = cross(c, a, P);
  const allPos = d1 > 0n && d2 > 0n && d3 > 0n;
  const allNeg = d1 < 0n && d2 < 0n && d3 < 0n;
  return allPos || allNeg;
}
