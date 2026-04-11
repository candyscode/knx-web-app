FROM node:20-bookworm-slim AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM node:20-bookworm-slim AS backend-deps

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3001
ENV KNX_CONFIG_DIR=/app/data

WORKDIR /app

COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules
COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/config`).then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "backend/server.js"]
