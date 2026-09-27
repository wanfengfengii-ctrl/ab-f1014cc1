// 业务冒烟夹具：一份有效网格、一份边交叉网格。
// 纯 JSON，便于 Node 冒烟与前端示例共用。

export const validMesh = {
  pointsText: [
    '# 编号 x y',
    '1 0 0',
    '2 4 0',
    '3 4 4',
    '4 0 4',
    '5 2 2',
  ].join('\n'),
  trianglesText: [
    '# 正方形加中心点，四个逆时针三角形',
    '1 2 5',
    '2 3 5',
    '3 4 5',
    '4 1 5',
  ].join('\n'),
};

export const crossingMesh = {
  pointsText: [
    '1 0 0',
    '2 6 0',
    '3 0 6',
    '4 2 2',
    '5 6 2',
    '6 2 6',
  ].join('\n'),
  trianglesText: [
    '1 2 3',
    '4 5 6',
  ].join('\n'),
};
