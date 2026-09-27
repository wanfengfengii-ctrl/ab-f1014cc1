/**
 * 录入文本解析（浏览器与 Node / 冒烟共用，保证“录入什么就核验什么”）。
 * 每行形如：
 *   测点：  编号 x y
 *   三角形：a b c
 * 空行与以 # 开头的行忽略；字段可用空白或逗号分隔。
 */

export function parseIntStrict(token) {
  if (typeof token !== 'string' || !/^[+-]?\d+$/.test(token)) return null;
  return Number(token);
}

function parseLines(text, expected, kind) {
  const rows = [];
  const lines = String(text ?? '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const tokens = line.split(/[\s,;]+/).filter(Boolean);
    if (tokens.length !== expected) {
      return {
        error: {
          code: 'PARSE_ERROR',
          row: i + 1,
          message: `第 ${i + 1} 行需要 ${expected} 个整数（${kind}），实际解析出 ${tokens.length} 项`,
        },
      };
    }
    const values = tokens.map(parseIntStrict);
    const bad = values.findIndex((v) => v === null);
    if (bad !== -1) {
      return {
        error: {
          code: 'PARSE_ERROR',
          row: i + 1,
          message: `第 ${i + 1} 行的“${tokens[bad]}”不是整数`,
        },
      };
    }
    rows.push(values);
  }
  return { data: rows };
}

export function parsePointsText(text) {
  const r = parseLines(text, 3, '编号 x y');
  if (r.error) return r;
  return { data: r.data.map(([id, x, y]) => ({ id, x, y })) };
}

export function parseTrianglesText(text) {
  const r = parseLines(text, 3, '三个顶点编号');
  if (r.error) return r;
  return { data: r.data };
}
