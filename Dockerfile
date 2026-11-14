# Stage 1: build the React SPA
FROM node:22-bookworm-slim AS frontend

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src

RUN npm run build

# Stage 2: Python runtime (sync + static server)
FROM python:3.12-slim-bookworm

WORKDIR /app

# Non-root user; garth tokens live in /home/app/.garth
RUN useradd --create-home --uid 1000 --shell /bin/bash app

COPY fetch/requirements.txt /app/fetch/requirements.txt
RUN pip install --no-cache-dir -r /app/fetch/requirements.txt

COPY fetch /app/fetch
COPY --from=frontend /app/dist /app/dist

RUN mkdir -p /app/public/data /home/app/.garth \
    && chown -R app:app /app /home/app/.garth \
    && chmod +x /app/fetch/entrypoint.sh

ENV HOME=/home/app \
    HOST=0.0.0.0 \
    PORT=8787 \
    SYNC_INTERVAL_SECONDS=900 \
    PYTHONUNBUFFERED=1

# Entrypoint starts as root to chown mounted volumes, then drops to user app.
USER root

EXPOSE 8787

VOLUME ["/app/public/data", "/home/app/.garth"]

ENTRYPOINT ["/app/fetch/entrypoint.sh"]
