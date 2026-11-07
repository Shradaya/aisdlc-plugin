// Minimal ZIP writer (deflate, no zip64) so evidence can be packed the same way on Windows, macOS and Linux without
// relying on zip/Compress-Archive/tar being present. Enough for HTML reports and screenshot folders (< 4 GB, < 65k files).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  return {
    time:
      (d.getHours() << 11) |
      (d.getMinutes() << 5) |
      Math.floor(d.getSeconds() / 2),
    date:
      ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// entries: [{ name: "folder/file.ext", data: Buffer }] -> Buffer holding the .zip
function zipEntries(entries) {
  const parts = [],
    central = [];
  let offset = 0;
  const { time, date } = dosDateTime(new Date());
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name.replace(/\\/g, "/"), "utf8");
    const deflated = zlib.deflateRawSync(data);
    const method = deflated.length < data.length ? 8 : 0;
    const body = method ? deflated : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, body);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(time, 12);
    cen.writeUInt16LE(date, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cenBuf, end]);
}

// Zip a folder into outFile; entries are named "<basename of dir>/<relative path>". skip(relPath) excludes files.
function zipDir(dir, outFile, skip = () => false) {
  const top = path.basename(dir);
  const entries = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const rel = path.relative(dir, p).replace(/\\/g, "/");
      if (e.isDirectory()) walk(p);
      else if (!skip(rel))
        entries.push({ name: `${top}/${rel}`, data: fs.readFileSync(p) });
    }
  })(dir);
  fs.writeFileSync(outFile, zipEntries(entries));
  return entries.length;
}

module.exports = { zipEntries, zipDir, crc32 };
