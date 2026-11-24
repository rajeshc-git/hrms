# Alternative Dockerfile demonstrating pure Zig 0.13+ static musl build
# STAGE 1: Frontend build with Bun
FROM oven/bun:latest AS frontend-builder
WORKDIR /app
COPY package.json ./
RUN bun install
COPY frontend/ ./frontend/
COPY build.js ./
RUN bun run build.js

# STAGE 2: Zig Static Binary Build
FROM alpine:3.20 AS zig-builder
RUN apk add --no-cache curl tar xz
RUN curl -s -L -o zig.tar.xz https://ziglang.org/download/0.13.0/zig-linux-x86_64-0.13.0.tar.xz && \
    tar -xf zig.tar.xz && \
    mv zig-linux-x86_64-0.13.0 /opt/zig
ENV PATH="/opt/zig:$PATH"

WORKDIR /src
COPY server/main.zig ./
COPY --from=frontend-builder /app/frontend/dist/index.html.gz ./frontend_bundle.gz

# Compile ReleaseSmall static binary
RUN zig build-exe main.zig -O ReleaseSmall -target x86_64-linux-musl --strip -femit-bin=/src/bharat_hr_zig

# STAGE 3: Scratch image
FROM scratch
COPY --from=zig-builder /src/bharat_hr_zig /server
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["/server"]
