import { readFileSync, writeFileSync } from "fs";
import { gzipSync } from "zlib";

console.log("🚀 Building frontend with Bun...");

const buildResult = await Bun.build({
  entrypoints: ["./frontend/app.js"],
  outdir: "./frontend/dist",
  minify: true,
  target: "browser",
  format: "iife",
  naming: "bundle.js"
});

if (!buildResult.success) {
  console.error("Build failed:", buildResult.logs);
  process.exit(1);
}

const jsCode = readFileSync("./frontend/dist/bundle.js", "utf-8");
const cssCode = readFileSync("./frontend/style.css", "utf-8");
let html = readFileSync("./frontend/index.html", "utf-8");

// Inline CSS and JS into single production HTML
const finalHtml = html
  .replace('<link rel="stylesheet" href="style.css">', `<style>${cssCode}</style>`)
  .replace('<script type="module" src="app.js"></script>', `<script>${jsCode}</script>`);

writeFileSync("./frontend/dist/index.html", finalHtml);

// Create gzipped version for zero-overhead streaming directly from memory
const gzipped = gzipSync(Buffer.from(finalHtml, "utf-8"), { level: 9 });
writeFileSync("./frontend/dist/index.html.gz", gzipped);

// Also generate a minimal manifest.json (will be served by the C server)
const manifest = JSON.stringify({
  name: "Bharat HR Portal",
  short_name: "Bharat HR",
  description: "Indian IT & Corporate HR Contact Manager with 3D Campus",
  start_url: "/",
  display: "standalone",
  background_color: "#f5f5f7",
  theme_color: "#0f172a",
  orientation: "portrait",
  icons: [
    {
      src: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' rx='40' fill='%230284c7'/><text x='96' y='125' font-size='100' text-anchor='middle' fill='white' font-family='system-ui' font-weight='800'>HR</text></svg>",
      sizes: "192x192",
      type: "image/svg+xml",
      purpose: "any maskable"
    }
  ]
});
writeFileSync("./frontend/dist/manifest.json", manifest);

// Minimal service worker for Add to Home Screen + offline shell
const sw = `self.addEventListener('install',e=>{self.skipWaiting()});self.addEventListener('activate',e=>{e.waitUntil(clients.claim())});self.addEventListener('fetch',e=>{e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))});`;
writeFileSync("./frontend/dist/sw.js", sw);

console.log(`✅ Build complete! Raw: ${(finalHtml.length / 1024).toFixed(1)} KB | Gzip: ${(gzipped.length / 1024).toFixed(1)} KB`);
