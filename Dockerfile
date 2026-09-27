# 水下马赛克三角网核验：零运行时依赖，Node 内置模块即可运行与构建。
FROM node:22-alpine

WORKDIR /app

# 先拷清单与源码（本项目无第三方依赖，无需 npm install）
COPY package.json ./
COPY src ./src
COPY web ./web
COPY tools ./tools
COPY test ./test
COPY server.mjs ./

# 镜像构建阶段产出静态文件 dist/
RUN node tools/build.mjs

ENV WEB_PORT=8080
EXPOSE 8080

# 容器级健康检查（compose 中也有等价声明）
HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${WEB_PORT}/healthz || exit 1

CMD ["node", "server.mjs"]
