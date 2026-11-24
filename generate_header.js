import { readFileSync, writeFileSync } from "fs";

// Generate C header for a raw text/binary file
function genHeader(inPath, varPrefix, outPath) {
  const buffer = readFileSync(inPath);
  let out = `// Auto-generated — do not edit\n#pragma once\n#include <stddef.h>\n#include <stdint.h>\n\n`;
  out += `static const size_t ${varPrefix}_LEN = ${buffer.length};\n`;
  out += `static const uint8_t ${varPrefix}_DATA[] = {\n  `;
  for (let i = 0; i < buffer.length; i++) {
    out += "0x" + buffer[i].toString(16).padStart(2, "0") + ", ";
    if ((i + 1) % 20 === 0) out += "\n  ";
  }
  out += "\n};\n";
  writeFileSync(outPath, out);
  console.log(`  ✅ ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

const mode = process.argv[2] || "bundle";

if (mode === "bundle") {
  // Frontend gzipped HTML bundle
  const inPath = process.argv[3] || "./frontend/dist/index.html.gz";
  const outPath = process.argv[4] || "./frontend_bundle.h";
  const buffer = readFileSync(inPath);
  let out = "// Auto-generated — do not edit\n#pragma once\n#include <stddef.h>\n#include <stdint.h>\n\n";
  out += `static const size_t EMBEDDED_BUNDLE_GZ_LEN = ${buffer.length};\n`;
  out += "static const uint8_t EMBEDDED_BUNDLE_GZ[] = {\n  ";
  for (let i = 0; i < buffer.length; i++) {
    out += "0x" + buffer[i].toString(16).padStart(2, "0") + ", ";
    if ((i + 1) % 20 === 0) out += "\n  ";
  }
  out += "\n};\n";
  writeFileSync(outPath, out);
  console.log(`  ✅ ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
} else if (mode === "pwa") {
  // Generate manifest.json and sw.js headers
  genHeader("./frontend/dist/manifest.json", "MANIFEST_JSON", "./manifest_json.h");
  genHeader("./frontend/dist/sw.js", "SW_JS", "./sw_js.h");
}
