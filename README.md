# 水下遗址马赛克 · 三角网核验台

水下遗址修复师在补配前，用本工具把散落马赛克的测点与人工连线整理成三角网并核验：
网格不得有重叠、破口或无法落在同一平面上的局部结构。全部判定仅在本机完成（纯静态页面 + 零第三方依赖）。

## 功能

- 浏览器录入/编辑 **4–20 个唯一编号的整数坐标测点** 与 **三角形顶点编号**（每行一组）。
- 点击「核验」后在 SVG 图上查看：三角形、边界环（唯一顺序）、每条边的相邻面、首项风险证据。
- 内置「有效网格」「交叉网格」两个示例，一键载入。
- **草稿变更（任何录入改动）立即撤销旧报告与图示**，需重新核验。
- 失败时按 **边 / 三角形录入顺序** 指出首个不能作为连续拼补底图的证据。

## 核验规则（按阶段，任一失败即拒绝）

| 阶段 | 规则 |
|---|---|
| 0 | 测点 4–20 个、编号唯一、整数坐标、坐标不重合；三角形顶点引用存在 |
| 1 | 每个三角形严格逆时针（有向面积 ×2 > 0） |
| 2 | 每条边恰被 1 或 2 个面使用 |
| 3 | 内部边（2 面共用）的两面分居边的两侧（否则折叠/异面） |
| 4 | 顶点不落在非关联边上（按边首次录入顺序报告首项） |
| 5 | 不共端边不交叉、不相切（按边首次录入顺序报告首项） |
| 6 | 三角形内部互不重叠（按三角形录入顺序报告首项） |
| 7 | 全部边界边按唯一顺序组成一个简单闭环（度数=2 且连通） |

## 目录结构

```
index.html            页面
styles.css            样式
src/geometry.js       核验核心（浏览器/Node 共用的纯函数）
src/parser.js         录入文本解析（行级错误提示）
src/samples.js        内置示例（与 fixtures/*.json 一致，有测试守护）
src/app.js            浏览器交互与 SVG 渲染
fixtures/valid.json     有效网格（冒烟用）
fixtures/crossing.json  交叉网格（冒烟用）
tests/                node:test 单元测试
smoke/smoke.mjs       业务冒烟（有效/交叉网格 + 静态服务健康检查）
scripts/build.mjs     前端构建（dist/）
scripts/serve.mjs     零依赖静态服务（/healthz 健康检查）
Dockerfile            多阶段：builder / verify / web
docker-compose.yml    verify（一次性核验）+ web（静态服务）
```

## 本地运行（需 Node ≥ 22）

```bash
npm test          # 单元测试
npm run build     # 前端构建到 dist/
npm run smoke     # 业务冒烟（需先 build）
npm run verify    # = test + build + smoke
npm start         # 构建并启动静态服务（默认 8080，可用 WEB_PORT 覆盖）
```

打开 `http://localhost:8080` 即可使用。

## Docker / Compose

```bash
# 一次性核验：测试 + 构建 + 冒烟，退出码即报告
docker compose build verify
docker compose run --rm verify        # 退出码 0=通过，非 0=失败

# 静态 Web 服务（宿主机端口由 WEB_PORT 配置，默认 8080）
WEB_PORT=9000 docker compose up -d web
docker compose ps                     # 查看健康状态（healthcheck: /healthz）
```

- `web` 服务：容器内固定 8080，宿主机端口 `${WEB_PORT:-8080}`，自带健康检查。
- `verify` 服务：一次性容器，依次执行 `npm test`、`npm run build`、`npm run smoke`，
  冒烟会载入 `fixtures/valid.json`（必须通过）与 `fixtures/crossing.json`（必须以
  边交叉被拒），最后以退出码报告结论。

## 录入格式

测点（每行 `编号 x y`）：

```
1 0 0
2 4 0
3 4 4
4 0 4
5 2 2
```

三角形（每行三个顶点编号，按逆时针录入）：

```
1 2 5
2 3 5
3 4 5
4 1 5
```
