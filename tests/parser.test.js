import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePointsText, parseTrianglesText } from '../src/parser.js';

test('解析测点：空白/逗号分隔、忽略空行与注释', () => {
  const text = `# 测点表
1 0 0

2, 4, 0
3 ; 0 ; 4
4	2	2
`;
  const r = parsePointsText(text);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.data, [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 4, y: 0 },
    { id: 3, x: 0, y: 4 },
    { id: 4, x: 2, y: 2 },
  ]);
});

test('解析三角形：负号编号也可识别', () => {
  const r = parseTrianglesText('1 -2 3\n');
  assert.deepEqual(r.data, [[1, -2, 3]]);
});

test('字段数错误带行号', () => {
  const r = parsePointsText('1 0\n2 0 0');
  assert.equal(r.error.row, 1);
  assert.match(r.error.message, /第 1 行/);
});

test('非整数带行号', () => {
  const r = parseTrianglesText('1 2 x');
  assert.equal(r.error.row, 1);
  assert.match(r.error.message, /不是整数/);
});

test('空文本得到空数组（交由核验器报数量错误）', () => {
  assert.deepEqual(parsePointsText('').data, []);
  assert.deepEqual(parseTrianglesText('# only comment').data, []);
});
