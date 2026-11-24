# ==============================================================================
# Multi-Stage Ultra-Low Memory Dockerfile
# Stage 1: Bun builds and gzips frontend + generates PWA assets
# Stage 2: Static musl C epoll backend with ALL assets embedded
# Stage 3: FROM scratch — zero OS, single binary
# ==============================================================================

FROM oven/bun:latest AS frontend-builder
WORKDIR /app
COPY package.json ./
RUN bun install
COPY frontend/ ./frontend/
COPY build.js ./
COPY generate_header.js ./

# Bundle frontend, generate PWA manifest and SW
RUN bun run build.js
# Generate C headers for all embedded assets
RUN bun run generate_header.js bundle ./frontend/dist/index.html.gz ./frontend_bundle.h
RUN bun run generate_header.js pwa

# ==============================================================================
FROM alpine:3.20 AS c-builder
RUN apk add --no-cache gcc musl-dev
WORKDIR /src
COPY --from=frontend-builder /app/frontend_bundle.h ./
COPY --from=frontend-builder /app/manifest_json.h ./
COPY --from=frontend-builder /app/sw_js.h ./
COPY server/main.c ./

RUN gcc -Os -static -s -Wall -Wextra main.c -o /src/bharat_hr_server

# ==============================================================================
FROM scratch
COPY --from=c-builder /src/bharat_hr_server /server
EXPOSE 5678
VOLUME ["/data"]
ENTRYPOINT ["/server", "5678"]
