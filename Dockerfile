# syntax=docker/dockerfile:1

# ---- 基础阶段：零第三方依赖，仅复制源码与工具脚本 ----
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY tests ./tests
COPY smoke ./smoke
COPY fixtures ./fixtures
COPY scripts ./scripts
COPY index.html styles.css ./

# ---- 构建阶段：产出 dist/ 静态站点 ----
FROM base AS builder
RUN node scripts/build.mjs

# ---- 一次性核验阶段：由 compose 的 verify 服务在容器启动时执行 ----
# 代码测试 -> 前端构建 -> 业务冒烟（含有效/交叉两份网格）；
# 任一步失败容器即以非零退出码报告。
FROM base AS verify
CMD ["npm", "run", "verify"]

# ---- 静态 Web 服务阶段：仅保留 dist/ 与服务脚本 ----
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json ./
COPY scripts ./scripts
COPY --from=builder /app/dist ./dist
ENV WEB_PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.WEB_PORT||8080)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "scripts/serve.mjs"]
