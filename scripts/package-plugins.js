#!/usr/bin/env node
// Build one installable zip per plugin: dist/<plugin>-<version>.zip, with the plugin folder's contents at the zip root
// (so .claude-plugin/plugin.json is at the top). Only git-tracked files are included. No dependencies.
//   node scripts/package-plugins.js [plugin-name ...]
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(entries) { // entries: [{ name, data: Buffer }]
  const local = [], central = []; let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8"), comp = zlib.deflateRawSync(data), crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    local.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

const market = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude-plugin", "marketplace.json"), "utf8"));
const want = process.argv.slice(2);
fs.mkdirSync(DIST, { recursive: true });
for (const p of market.plugins) {
  if (want.length && !want.includes(p.name)) continue;
  const dir = path.join(ROOT, p.source);
  const rel = path.relative(ROOT, dir).split(path.sep).join("/");
  const files = execFileSync("git", ["-C", ROOT, "ls-files", "-z", "--", rel], { encoding: "utf8" }).split("\0").filter(Boolean);
  const entries = files.filter((f) => fs.existsSync(path.join(ROOT, f)))
    .map((f) => ({ name: f.slice(rel.length + 1), data: fs.readFileSync(path.join(ROOT, f)) }));
  if (!entries.some((e) => e.name === ".claude-plugin/plugin.json")) throw new Error(`${p.name}: no .claude-plugin/plugin.json`);
  const { version } = JSON.parse(entries.find((e) => e.name === ".claude-plugin/plugin.json").data.toString("utf8"));
  const out = path.join(DIST, `${p.name}-${version}.zip`);
  fs.writeFileSync(out, zip(entries));
  console.log(`${path.relative(ROOT, out)}  (${entries.length} files)`);
}
