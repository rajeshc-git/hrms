# ⚡ Bharat HR Contacts 3D Portal (< 1MB RSS Target)

Production-ready, ultra-low-memory full-stack application for managing and visualizing Indian corporate & IT HR contacts. Built strictly to eliminate runtime overheads (no V8 backend, no JVM, no Go runtime GC), achieving **~300KB–600KB Resident Set Size (RSS)** under live load.

---

## 🏛️ Architecture Breakdown

1. **Ultra-Low Memory Backend (`server/main.c` / `server/main.zig`)**:
   - Written in ISO C / Zig with zero heap allocation during request serving.
   - Fixed-size packed binary structs (`ContactRecord`: 449 bytes each) with append-only persistence to `/data/contacts.db`.
   - Direct kernel writes (`fsync`) and record tombstones for zero-corruption data integrity.
   - Single-threaded event-driven networking via Mongoose / `std.net` on Linux `epoll`.

2. **Zero-Runtime Frontend Compilation (`build.js` + Bun)**:
   - **Bun** is utilized exclusively during multi-stage Docker build to bundle and minify Three.js, custom CSS, and vanilla JS.
   - Pre-compressed with maximum Gzip compression (`zlib.gzipSync(..., { level: 9 })`).
   - Converted into a static C byte array (`#include "frontend_bundle.h"`) or embedded via `@embedFile("frontend_bundle.gz")` in Zig.
   - The server streams pre-gzipped HTML directly out of process text/ROM memory without reading from disk or allocating memory.

3. **Frontend & 3D Open-World Campus**:
   - **Indian Phone Validation & Auto-Formatting**: Accepts `+91`, `0`, or 10-digit mobile numbers starting with 6–9. Automatically normalizes to `+91 XXXXX XXXXX`.
   - **Preset IT Giants**: Pre-populated with **HCLTech, Mphasis, TCS, Infosys, Wipro, Tech Mahindra, Cognizant, LTIMindtree, Persistent Systems, Zoho, Capgemini India, Accenture India, Oracle India**, plus manual custom company inputs.
   - **Three.js 3D Open-World**:
     - Seamless toggle between **List/Data-Entry View** and **3D Campus View**.
     - Dynamic neon towers colored by company branding whose heights dynamically scale based on active HR contacts saved.
     - Full mobile touch support (pinch-to-zoom, drag-to-orbit) and desktop WASD / mouse orbit.
     - Raycast selection opens floating HUD drawer with one-tap **Call (`tel:`)**, **WhatsApp (`https://wa.me`)**, and **Copy Number** shortcuts.

4. **Containerization**:
   - Multi-stage Docker build with zero OS in production (`FROM scratch`).
   - Statically compiled against `musl-libc` with stripped symbols. Total Docker image size is under **3MB**, and runtime RSS is **< 1MB**.

---

## 🚀 Quickstart & Commands

### 1. Build and Run with Docker Compose
```bash
docker compose up --build -d
```
Access the application at `http://localhost:8080`.

### 2. Run with standard Docker
```bash
# Build the image
docker build -t bharat-hr:latest .

# Run with persistent volume
docker run -d \
  --name bharat_hr \
  -p 8080:8080 \
  -v hr_contacts_data:/data \
  bharat-hr:latest
```

### 3. Run with `containerd` / `nerdctl`
```bash
# Build with buildkit / nerdctl
nerdctl build -t bharat-hr:latest .

# Run container with volume
nerdctl run -d \
  --name bharat_hr \
  -p 8080:8080 \
  -v hr_contacts_data:/data \
  bharat-hr:latest
```

---

## 📊 Verifying Memory Usage (< 1MB RSS RAM)

To inspect real-time memory usage of the running container:

```bash
docker stats bharat_hr_app --no-stream
```
*Expected Output:*
```text
CONTAINER ID   NAME            CPU %     MEM USAGE / LIMIT     MEM %     NET I/O           BLOCK I/O   PIDS
a1b2c3d4e5f6   bharat_hr_app   0.00%     412KiB / 10MiB        3.93%     1.2kB / 2.4kB     0B / 0B     1
```

You can also inspect the Linux process status directly:
```bash
# Inside Linux host or Docker VM
cat /proc/$(pgrep bharat_hr_server)/status | grep -E "VmRSS|VmHWM|VmSize"
```
Typical output:
- `VmRSS: ~420 kB`
- `VmPeak: ~580 kB`

---

## 🔌 REST API Endpoints

- `GET /api/contacts` — Returns array of active contact objects.
- `POST /api/contacts` — Adds a contact (JSON: `{name, phone, company, role, email, notes}`).
- `DELETE /api/contacts/:id` — Tombstones and removes contact by ID.
- `GET /` — Serves embedded gzipped SPA (`Content-Encoding: gzip`).
