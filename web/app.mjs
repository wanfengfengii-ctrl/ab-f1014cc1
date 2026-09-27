// 浏览器端：录入、解析、调用本机核验核心、渲染 SVG 与证据表。
// 核验逻辑全部来自 src/ 下的同一份模块，无网络请求。

import { verifyMesh } from './verify.mjs';
import {
  parsePoints,
  parseTriangles,
  pointsToText,
  trianglesToText,
} from './parse.mjs';
import { validMesh, crossingMesh } from './fixtures.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);

const pointsInput = $('pointsInput');
const trianglesInput = $('trianglesInput');
const reportEl = $('report');
const svg = $('meshSvg');
const placeholder = $('canvasPlaceholder');
const edgeBody = $('#edgeTable tbody');
const triBody = $('#triTable tbody');

let lastResult = null;

function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function clearSvg() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function markStale() {
  if (!lastResult) return;
  lastResult = null;
  reportEl.innerHTML = '<div class="card parse"><div class="title">草稿已修改，上一份核验报告已撤销</div>请重新点击“核验”。</div>';
  svg.classList.add('stale-svg');
  edgeBody.innerHTML = '';
  triBody.innerHTML = '';
}

// 将整数坐标映射到 SVG 视口（y 轴翻转，留边距）
function makeProjection(points) {
  const W = 800;
  const H = 560;
  const M = 56;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = Math.min((W - 2 * M) / spanX, (H - 2 * M) / spanY);
  return {
    W, H,
    sx: (x) => M + (x - minX) * scale,
    sy: (y) => H - M - (y - minY) * scale,
  };
}

function renderResult(points, triangles, result) {
  clearSvg();
  svg.classList.remove('stale-svg');
  edgeBody.innerHTML = '';
  triBody.innerHTML = '';
  if (!points.length) {
    placeholder.style.display = 'flex';
    return;
  }
  placeholder.style.display = 'none';

  const at = new Map(points.map((p) => [p.id, p]));
  const proj = makeProjection(points);
  svg.setAttribute('viewBox', `0 0 ${proj.W} ${proj.H}`);
  const P = (id) => ({ x: proj.sx(at.get(id).x), y: proj.sy(at.get(id).y) });

  const err = result?.error;
  const data = result?.data;
  const errEdge = new Set();
  if (err?.edgeIndex !== undefined) {
    errEdge.add(err.edgeIndex);
    if (err.edgeIndex2 !== undefined) errEdge.add(err.edgeIndex2);
  }

  // 三角形面（引用了未知测点的行只在表格中报告，不参与绘图）
  triangles.forEach((t, i) => {
    if (!t.every((id) => at.has(id))) return;
    const pts = t.map((id) => { const q = P(id); return `${q.x},${q.y}`; }).join(' ');
    const poly = svgEl('polygon', {
      points: pts,
      class: `svg-tri${err?.triangleIndex === i || err?.triangleIndex2 === i ? ' error' : ''}`,
    });
    const title = `T${i + 1}：${t.join(' → ')}`;
    poly.appendChild(svgEl('title', {}, title));
    svg.appendChild(poly);
  });

  // 边
  for (const e of data?.edges ?? []) {
    if (!at.has(e.u) || !at.has(e.v)) continue;
    const a = P(e.u);
    const b = P(e.v);
    const isBoundary = e.faces.length === 1;
    const cls = errEdge.has(e.index)
      ? 'svg-edge-error'
      : isBoundary
        ? 'svg-edge-boundary'
        : 'svg-edge-internal';
    const line = svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: cls });
    line.appendChild(svgEl('title', {}, `e${e.index + 1}（${e.u}–${e.v}）相邻面：${e.faces.map((f) => `T${f + 1}`).join('、') || '—'}`));
    svg.appendChild(line);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const lbl = svgEl('text', { x: mid.x + 2, y: mid.y - 2, class: 'svg-edgelabel' }, `e${e.index + 1}`);
    svg.appendChild(lbl);
  }

  // 边界闭环（绿色虚线）
  if (result?.ok && data.boundaryLoop.length >= 3) {
    const pts = data.boundaryLoop.map((id) => { const q = P(id); return `${q.x},${q.y}`; }).join(' ');
    svg.appendChild(svgEl('polygon', { points: pts, class: 'svg-loop' }));
  }

  // 顶点与编号
  const errPoint = err?.pointId;
  for (const p of points) {
    const q = P(p.id);
    svg.appendChild(svgEl('circle', {
      cx: q.x, cy: q.y, r: 4,
      class: `svg-vertex${p.id === errPoint ? ' error' : ''}`,
    }));
    svg.appendChild(svgEl('text', { x: q.x + 6, y: q.y - 6, class: 'svg-label' }, String(p.id)));
  }

  // 边相邻面表
  for (const e of data?.edges ?? []) {
    const tr = document.createElement('tr');
    const isBoundary = e.faces.length === 1;
    tr.innerHTML = `<td>e${e.index + 1}</td><td>${e.u} – ${e.v}</td>`
      + `<td>${e.faces.length}</td>`
      + `<td>${e.faces.map((f) => `T${f + 1}`).join('、') || '—'}</td>`
      + `<td><span class="tag ${isBoundary ? 'boundary' : 'internal'}">${isBoundary ? '边界边' : '内部边'}</span></td>`;
    edgeBody.appendChild(tr);
  }

  // 三角形表
  triangles.forEach((t, i) => {
    const tr = document.createElement('tr');
    const isErr = err?.triangleIndex === i || err?.triangleIndex2 === i;
    tr.innerHTML = `<td>T${i + 1}</td><td>${t.join(' → ')}</td>`
      + `<td>${isErr ? '<span class="tag boundary">首项证据</span>' : '<span class="tag ok">已录入</span>'}</td>`;
    triBody.appendChild(tr);
  });
}

function renderReport(result, parseErrors) {
  if (parseErrors.length) {
    reportEl.innerHTML = `<div class="card parse"><div class="title">录入存在 ${parseErrors.length} 处格式问题，已停止核验</div>`
      + `<ul>${parseErrors.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
    return;
  }
  if (result.ok) {
    const { edges, boundaryLoop, triangles } = result.data;
    const internal = edges.filter((e) => e.faces.length === 2).length;
    const boundary = edges.length - internal;
    reportEl.innerHTML = `<div class="card ok"><div class="title">核验通过：可作为连续拼补底图</div>`
      + `<div>三角形 ${triangles.length} 个；内部边 ${internal} 条（两面相邻）、边界边 ${boundary} 条；`
      + `边界环：${boundaryLoop.join(' → ')} → ${boundaryLoop[0]}</div></div>`;
    return;
  }
  reportEl.innerHTML = `<div class="card bad"><div class="title">核验未通过 · 首项风险证据</div>`
    + `<div><code>${result.error.code}</code>：${result.error.message}</div>`
    + `<div class="stale">检查按测点、三角形与边的录入顺序进行；修复本项后重新核验，将继续给出下一项证据。</div></div>`;
}

function runVerify() {
  const { points, errors: pointErrors } = parsePoints(pointsInput.value);
  const { triangles, errors: triErrors } = parseTriangles(trianglesInput.value);
  const parseErrors = [...pointErrors, ...triErrors];
  const result = parseErrors.length ? null : verifyMesh(points, triangles);
  lastResult = { points, triangles, result, parseErrors };
  if (parseErrors.length) {
    clearSvg();
    placeholder.style.display = 'flex';
    edgeBody.innerHTML = '';
    triBody.innerHTML = '';
  } else {
    renderResult(points, triangles, result);
  }
  renderReport(result ?? { ok: false, error: null }, parseErrors);
}

function loadSample(sample) {
  pointsInput.value = sample.pointsText;
  trianglesInput.value = sample.trianglesText;
  runVerify();
}

$('verifyBtn').addEventListener('click', runVerify);
$('validSampleBtn').addEventListener('click', () => loadSample(validMesh));
$('crossSampleBtn').addEventListener('click', () => loadSample(crossingMesh));
$('clearBtn').addEventListener('click', () => {
  pointsInput.value = '';
  trianglesInput.value = '';
  lastResult = null;
  reportEl.innerHTML = '';
  edgeBody.innerHTML = '';
  triBody.innerHTML = '';
  clearSvg();
  svg.classList.remove('stale-svg');
  placeholder.style.display = 'flex';
  pointsInput.focus();
});
for (const ta of [pointsInput, trianglesInput]) {
  ta.addEventListener('input', markStale);
}

// 首次打开预载有效网格，便于直接看到图示
loadSample(validMesh);

// 供手工调试
window.__mesh = { verifyMesh, parsePoints, parseTriangles, pointsToText, trianglesToText };
