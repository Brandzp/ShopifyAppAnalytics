import fs from "fs";
import path from "path";

const ROOT = "C:/Work/ShopifyApp/ShopifyAppAnalytics";
const SKIP = new Set(["node_modules", ".next", ".next-verify", ".git"]);

function scan(dir, results) {
  let items;
  try { items = fs.readdirSync(dir); } catch { return; }
  for (const item of items) {
    if (SKIP.has(item)) continue;
    const full = path.join(dir, item);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      scan(full, results);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(item)) {
      let buf;
      try { buf = fs.readFileSync(full); } catch { continue; }
      // CP1255/CP1252 mojibake: repeated 0xC3 0x97 (×) sequences — Hebrew stored as Latin-1
      let mojiCount = 0;
      for (let i = 0; i < buf.length - 4; i++) {
        if (buf[i] === 0xC3 && buf[i+1] === 0x97 && buf[i+2] === 0xC3 && buf[i+3] === 0x97) {
          mojiCount++;
        }
      }
      if (mojiCount > 0) {
        const txt = buf.toString("utf8");
        const idx = txt.indexOf("\xC3\x97\xC3\x97");
        const snippet = txt.slice(Math.max(0, idx), idx + 40).replace(/\n/g, " ");
        results.push({ file: full.replace(ROOT + "/", "").replace(ROOT + "\\", ""), count: mojiCount, snippet });
      }
    }
  }
}

const results = [];
scan(ROOT, results);
if (results.length === 0) {
  console.log("NO_DOUBLE_MOJIBAKE_IN_SOURCE — fix may be complete at source level");
} else {
  console.log(`Found ${results.length} files with double-× mojibake:\n`);
  results.forEach(r => console.log(`  [${r.count}] ${r.file}\n       ${r.snippet}\n`));
}
