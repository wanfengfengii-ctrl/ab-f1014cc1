// 浏览器内置示例（内容须与 fixtures/*.json 保持一致，由 tests/samples.test.js 守护）
export const validSample = {
  pointsText: `1 0 0
2 4 0
3 4 4
4 0 4
5 2 2`,
  trianglesText: `1 2 5
2 3 5
3 4 5
4 1 5`,
};

export const crossingSample = {
  pointsText: `1 0 0
2 6 0
3 0 6
4 -1 3
5 7 1
6 7 5`,
  trianglesText: `1 2 3
4 5 6`,
};
