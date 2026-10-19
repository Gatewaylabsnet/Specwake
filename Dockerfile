FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# The web prototype needs no Electron binary or installer tooling at runtime.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig*.json vite.config.ts ./
COPY src ./src
COPY templates ./templates
COPY examples ./examples
COPY LICENSE ./LICENSE
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    SPECWAKE_PORT=4319 \
    SPECWAKE_MCP_PORT=4320 \
    SPECWAKE_CONTAINER_DEMO=1 \
    SPECWAKE_DATA_DIR=/app/.local-data
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/.local-data /app/.tmp && chown node:node /app/.local-data /app/.tmp && chmod 700 /app/.local-data /app/.tmp
USER node
# These are container ports, not host publications. Compose publishes only host loopback.
EXPOSE 4319 4320
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=4s --start-period=15s --retries=6 CMD node -e "fetch('http://127.0.0.1:4319/api/panel/health').then(async r=>process.exit(r.ok&&(await r.json()).ready===true?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/panel/cli.ts"]
