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
ENV NODE_ENV=production SPECWAKE_PORT=4319 SPECWAKE_DATA_DIR=/app/.local-data
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/.local-data /app/.tmp && chown node:node /app/.local-data /app/.tmp
USER node
# Deliberately no EXPOSE or wildcard bind. See docs/WEB_PROTOTYPE.md for Linux host networking.
HEALTHCHECK --interval=30s --timeout=4s CMD node -e "fetch('http://127.0.0.1:4319/panel').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/panel/cli.ts"]
