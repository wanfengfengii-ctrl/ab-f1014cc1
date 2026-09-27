// 测点 / 三角形录入文本解析。
// 每行一条记录，空白或逗号分隔，# 开头为注释。
// 测点：编号 x y（均为整数，编号唯一）
// 三角形：a b c（按逆时针给出的三个测点编号）

const INTEGER = /^[+-]?\d+$/;

function splitLine(line) {
  return line.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
}

function scanLines(text) {
  return text.split(/\r?\n/).map((raw, i) => ({ raw: raw.trim(), lineNo: i + 1 }))
    .filter(({ raw }) => raw.length > 0 && !raw.startsWith('#'));
}

export function parsePoints(text) {
  const points = [];
  const errors = [];
  for (const { raw, lineNo } of scanLines(text)) {
    const parts = splitLine(raw);
    const where = `测点第 ${lineNo} 行“${raw}”`;
    if (parts.length !== 3) {
      errors.push(`${where}：应为“编号 x y”三个整数，实际得到 ${parts.length} 项`);
      continue;
    }
    const [idTok, xTok, yTok] = parts;
    if (!INTEGER.test(idTok) || !INTEGER.test(xTok) || !INTEGER.test(yTok)) {
      errors.push(`${where}：编号与坐标必须全部为整数`);
      continue;
    }
    points.push({ id: Number(idTok), x: Number(xTok), y: Number(yTok) });
  }
  return { points, errors };
}

export function parseTriangles(text) {
  const triangles = [];
  const errors = [];
  for (const { raw, lineNo } of scanLines(text)) {
    const parts = splitLine(raw);
    const where = `三角形第 ${lineNo} 行“${raw}”`;
    if (parts.length !== 3) {
      errors.push(`${where}：应为“a b c”三个测点编号，实际得到 ${parts.length} 项`);
      continue;
    }
    if (!parts.every((p) => INTEGER.test(p))) {
      errors.push(`${where}：顶点编号必须全部为整数`);
      continue;
    }
    triangles.push(parts.map(Number));
  }
  return { triangles, errors };
}

export function pointsToText(points) {
  return points.map((p) => `${p.id} ${p.x} ${p.y}`).join('\n');
}

export function trianglesToText(triangles) {
  return triangles.map((t) => `${t[0]} ${t[1]} ${t[2]}`).join('\n');
}
