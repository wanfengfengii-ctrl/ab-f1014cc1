import { validateMesh } from './geometry.js';
import { parsePointsText, parseTrianglesText } from './parser.js';
import { validSample, crossingSample } from './samples.js';

const $ = (sel) => document.querySelector(sel);

const pointsEl = $('#pointsInput');
const trisEl = $('#trianglesInput');
const reportEl = $('#report');
const svgEl = $('#canvas');
const evidenceBoxEl = $('#evidenceBox');
const triBody = $('#triTable tbody');
const edgeBody = $('#edgeTable tbody');
const boundaryInfoEl = $('#boundaryInfo');

const SVG_W = 800;
const SVG_H = 560;
const PAD = 48;

const STAGE_NAMES = {
  INVALID_POINT_COUNT: '阶段0 · 测点数量',
  INVALID_POINT_ID: '阶段0 · 测点编号',
  DUPLICATE_POINT_ID: '阶段0 · 测点编号',
  NON_INTEGER_COORD: '阶段0 · 整数坐标',
  COORD_OUT_OF_RANGE: '阶段0 · 坐标范围',
  DUPLICATE_COORD: '阶段0 · 坐标重合',
  NO_TRIANGLES: '阶段0 · 三角形录入',
  INVALID_TRIANGLE: '阶段0 · 三角形录入',
  UNKNOWN_VERTEX: '阶段0 · 顶点引用',
  NOT_CCW: '阶段1 · 严格逆时针',
  EDGE_OVERUSED: '阶段2 · 边的使用次数',
  INTERNAL_EDGE_SAME_SIDE: '阶段3 · 内部边两面相邻',
  VERTEX_ON_EDGE: '阶段4 · 顶点不落非关联边',
  EDGE_CROSSING: '阶段5 · 不共端边交叉或相切',
  TRIANGLE_OVERLAP: '阶段6 · 三角形内部重叠',
  BOUNDARY_EMPTY: '阶段7 · 边界简单闭环',
  BOUNDARY_VERTEX_DEGREE: '阶段7 · 边界简单闭环',
  BOUNDARY_DISCONNECTED: '阶段7 · 边界简单闭环',
};

function svgEl2(tag, attrs = {}, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function trNode(cells, risk) {
  const tr = document.createElement('tr');
  if (risk) tr.className = 'risk-row';
  for (const c of cells) {
    const td = document.createElement('td');
    if (c instanceof Node) td.appendChild(c);
    else td.textContent = String(c);
    tr.appendChild(td);
  }
  return tr;
}

// ---------- 报告（草稿变更须撤销旧报告） ----------

function setReport(kind, stage, message) {
  reportEl.className = `report ${kind}`;
  reportEl.innerHTML = '';
  const span = document.createElement('span');
  span.className = 'stage';
  span.textContent = stage;
  const strong = document.createElement('strong');
  strong.textContent = message;
  reportEl.append(span, strong);
}

function clearReport() {
  reportEl.className = 'report';
  reportEl.textContent = '';
}

function clearOutputs() {
  triBody.innerHTML = '';
  edgeBody.innerHTML = '';
  boundaryInfoEl.textContent = '';
  evidenceBoxEl.classList.add('hidden');
  evidenceBoxEl.textContent = '';
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
}

function markDraft(message) {
  clearOutputs();
  setReport('draft', '草稿 · 输入尚未形成可核验的记录', message);
}

function runVerify() {
  clearOutputs();
  const pres = parsePointsText(pointsEl.value);
  if (pres.error) {
    markDraft(pres.error.message);
    return;
  }
  const tres = parseTrianglesText(trisEl.value);
  if (tres.error) {
    markDraft(tres.error.message);
    return;
  }
  const r = validateMesh(pres.data, tres.data);
  renderReport(r);
  renderTables(r);
  renderSvg(r, pres.data);
}

function renderReport(r) {
  if (r.ok) {
    setReport('ok', '全部阶段通过', r.message);
    evidenceBoxEl.classList.add('hidden');
    return;
  }
  setReport('bad', STAGE_NAMES[r.code] || '核验异常', r.message);
  evidenceBoxEl.classList.remove('hidden');
  evidenceBoxEl.textContent = `首项风险证据：${describeEvidence(r.code, r.evidence)}`;
}

function describeEvidence(code, ev) {
  switch (code) {
    case 'NOT_CCW':
      return `T${ev.triangle + 1}（${ev.verts.join('-')}）有向面积×2 = ${ev.area2}`;
    case 'EDGE_OVERUSED':
      return `边 ${ev.edge.join('-')} 被 ${ev.faces.map((i) => 'T' + (i + 1)).join('、')} 使用`;
    case 'INTERNAL_EDGE_SAME_SIDE':
      return `内部边 ${ev.edge.join('-')} 的两面 T${ev.faces[0] + 1}、T${ev.faces[1] + 1} 位于同侧`;
    case 'EDGE_CROSSING':
      return `边 ${ev.edge1.join('-')} 与边 ${ev.edge2.join('-')}`;
    case 'VERTEX_ON_EDGE':
      return `测点 ${ev.vertex} 落在边 ${ev.edge.join('-')} 上`;
    case 'TRIANGLE_OVERLAP':
      return `T${ev.triangles[0] + 1} 与 T${ev.triangles[1] + 1}（测点 ${ev.vertex}）`;
    default:
      return JSON.stringify(ev);
  }
}

// ---------- 表格 ----------

function riskTriangles(r) {
  const ev = r.evidence;
  if (!r.ok && ev) {
    if (typeof ev.triangle === 'number') return new Set([ev.triangle]);
    if (Array.isArray(ev.triangles) && ev.faces === undefined) {
      return new Set(ev.triangles.filter((x) => typeof x === 'number' && x >= 0 && x < (r.triangles?.length ?? 0)));
    }
    if (Array.isArray(ev.faces)) return new Set(ev.faces);
  }
  return new Set();
}

function isRiskEdge(r, e) {
  const ev = r.ok ? null : r.evidence;
  if (!ev) return false;
  const match = (pair) => pair && pair[0] === e.a && pair[1] === e.b;
  return match(ev.edge) || match(ev.edge1) || match(ev.edge2);
}

function renderTables(r) {
  triBody.innerHTML = '';
  edgeBody.innerHTML = '';
  boundaryInfoEl.textContent = '';
  if (!r.triangles) return;

  const riskTris = riskTriangles(r);
  r.triangles.forEach((t, i) => {
    const status = document.createElement('span');
    status.className = 'tag ' + (t.area2 > 0 ? 'good' : 'bad');
    status.textContent = t.area2 > 0 ? '严格逆时针' : '非逆时针';
    triBody.appendChild(trNode(
      [i + 1, t.verts.join('-'), t.area2, status],
      riskTris.has(t.index),
    ));
  });

  r.edges.forEach((e, i) => {
    const type = document.createElement('span');
    const boundary = e.faces.length === 1;
    type.className = 'tag ' + (boundary ? 'boundary' : 'interior');
    type.textContent = boundary ? '1面 · 边界' : '2面 · 内部';
    edgeBody.appendChild(trNode(
      [i + 1, `${e.a}-${e.b}`, e.faces.map((fi) => 'T' + (fi + 1)).join('、'), type],
      isRiskEdge(r, e),
    ));
  });

  if (r.ok) {
    boundaryInfoEl.innerHTML =
      `边界环共 ${r.boundaryLoop.length} 个顶点（按唯一顺序）：<br><strong>` +
      r.boundaryLoop.join(' → ') + ' → 回到起点</strong>';
  } else if (r.code === 'BOUNDARY_VERTEX_DEGREE' || r.code === 'BOUNDARY_DISCONNECTED' || r.code === 'BOUNDARY_EMPTY') {
    boundaryInfoEl.textContent = '边界无法组成唯一简单闭环，风险位置已在图上以红色标出。';
  } else {
    boundaryInfoEl.textContent = '核验失败于更早阶段，边界闭环尚不能确认。';
  }
}

// ---------- SVG ----------

function renderSvg(r, points) {
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
  if (!r.triangles || points.length === 0) return;

  const byId = new Map(points.map((p) => [p.id, p]));
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min((SVG_W - 2 * PAD) / spanX, (SVG_H - 2 * PAD) / spanY);
  const ox = PAD + ((SVG_W - 2 * PAD) - spanX * scale) / 2 - minX * scale;
  const oy = SVG_H - PAD - ((SVG_H - 2 * PAD) - spanY * scale) / 2 + minY * scale;
  const X = (x) => ox + x * scale;
  const Y = (y) => oy - y * scale;

  // 三角形面
  for (const t of r.triangles) {
    const pts = t.verts
      .map((id) => byId.get(id))
      .map((p) => `${X(p.x)},${Y(p.y)}`)
      .join(' ');
    svgEl.appendChild(svgEl2('polygon', {
      points: pts,
      fill: 'rgba(90,167,255,0.14)',
      stroke: 'none',
    }));
  }

  // 边：边界橙色，内部蓝色，风险红色加粗
  const boundaryKeys = new Set(
    r.ok ? r.boundaryEdgeKeys : r.edges.filter((e) => e.faces.length === 1).map((e) => e.key),
  );
  for (const e of r.edges) {
    const A = byId.get(e.a);
    const B = byId.get(e.b);
    const risk = isRiskEdge(r, e);
    const boundary = boundaryKeys.has(e.key);
    svgEl.appendChild(svgEl2('line', {
      x1: X(A.x), y1: Y(A.y), x2: X(B.x), y2: Y(B.y),
      stroke: risk ? '#ff5d6c' : boundary ? '#ffb454' : '#5aa7ff',
      'stroke-width': risk ? 4 : boundary ? 3 : 2,
      'stroke-linecap': 'round',
    }));
  }

  // 顶点
  for (const p of points) {
    svgEl.appendChild(svgEl2('circle', {
      cx: X(p.x), cy: Y(p.y), r: 5,
      fill: '#0e1726', stroke: '#a9c3e6', 'stroke-width': 1.5,
    }));
    svgEl.appendChild(svgEl2('text', {
      x: X(p.x) + 8, y: Y(p.y) - 8,
      fill: '#cfe0f5', 'font-size': 12,
    }, String(p.id)));
  }

  highlightEvidence(r, byId, X, Y);
}

function highlightEvidence(r, byId, X, Y) {
  if (r.ok) return;
  const ev = r.evidence;

  // 风险三角形：红色虚线描边
  const tris = [];
  if (typeof ev.triangle === 'number') tris.push(ev.triangle);
  if (Array.isArray(ev.triangles) && r.code === 'TRIANGLE_OVERLAP') tris.push(...ev.triangles);
  for (const ti of tris) {
    const t = r.triangles[ti];
    if (!t) continue;
    const pts = t.verts.map((id) => byId.get(id)).map((p) => `${X(p.x)},${Y(p.y)}`).join(' ');
    svgEl.appendChild(svgEl2('polygon', {
      points: pts, fill: 'none', stroke: '#ff5d6c',
      'stroke-width': 3, 'stroke-dasharray': '7 4',
    }));
  }

  // 风险顶点：红色圆环（落边、内部重叠的内含顶点、边界破口/分叉顶点）
  const vertexCodes = ['VERTEX_ON_EDGE', 'TRIANGLE_OVERLAP', 'BOUNDARY_VERTEX_DEGREE'];
  const riskVertex = ev.vertex !== undefined && vertexCodes.includes(r.code) ? ev.vertex : null;
  if (riskVertex !== null && byId.has(riskVertex)) {
    const p = byId.get(riskVertex);
    svgEl.appendChild(svgEl2('circle', {
      cx: X(p.x), cy: Y(p.y), r: 10,
      fill: 'none', stroke: '#ff5d6c', 'stroke-width': 2.5,
    }));
  }
}

// ---------- 交互 ----------

function loadSample(sample) {
  pointsEl.value = sample.pointsText;
  trisEl.value = sample.trianglesText;
}

// 草稿变更（任何录入改动）立即撤销旧报告与图示
let lastSig = null;
function onInput() {
  const sig = pointsEl.value + '||' + trisEl.value;
  if (sig === lastSig) return;
  lastSig = sig;
  clearOutputs();
  clearReport();
}
pointsEl.addEventListener('input', onInput);
trisEl.addEventListener('input', onInput);

$('#verifyBtn').addEventListener('click', () => {
  lastSig = pointsEl.value + '||' + trisEl.value;
  runVerify();
});
$('#sampleValidBtn').addEventListener('click', () => {
  loadSample(validSample);
  lastSig = pointsEl.value + '||' + trisEl.value;
  runVerify();
});
$('#sampleCrossBtn').addEventListener('click', () => {
  loadSample(crossingSample);
  lastSig = pointsEl.value + '||' + trisEl.value;
  runVerify();
});
$('#clearBtn').addEventListener('click', () => {
  pointsEl.value = '';
  trisEl.value = '';
  clearOutputs();
  clearReport();
});

// 初始载入有效样例并核验
loadSample(validSample);
runVerify();
lastSig = pointsEl.value + '||' + trisEl.value;
