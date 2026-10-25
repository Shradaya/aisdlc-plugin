import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// The workspace root is the parent of preview/ (preview lives at <workspace>/preview). Honor AISDLC_ROOT if set.
function workspaceRoot() {
  if (process.env.AISDLC_ROOT) return path.resolve(process.env.AISDLC_ROOT);
  return path.resolve(here, "..");
}

const TICKET_RE = /^[A-Za-z][A-Za-z0-9]*-\d+$/;

// Scan designs/<TICKET>/prototype/ for prototypes. Each .html file is a "screen"; index.html is the default.
function scanDesigns() {
  const root = workspaceRoot();
  const designsDir = path.join(root, "designs");
  const out = [];
  if (!fs.existsSync(designsDir)) return out;
  for (const ticket of fs.readdirSync(designsDir)) {
    if (!TICKET_RE.test(ticket)) continue;
    const protoDir = path.join(designsDir, ticket, "prototype");
    if (!fs.existsSync(protoDir) || !fs.statSync(protoDir).isDirectory()) continue;
    const screens = fs
      .readdirSync(protoDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".html"))
      .map((e) => e.name)
      .sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)));
    if (screens.length) out.push({ ticket, screens });
  }
  return out.sort((a, b) => a.ticket.localeCompare(b.ticket));
}

// Safely resolve a requested prototype file, refusing path traversal outside designs/<ticket>/prototype.
function resolvePrototypeFile(ticket, file) {
  if (!TICKET_RE.test(ticket)) return null;
  const root = workspaceRoot();
  const base = path.join(root, "designs", ticket, "prototype");
  const target = path.resolve(base, file || "index.html");
  const rel = path.relative(base, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return fs.existsSync(target) && fs.statSync(target).isFile() ? target : null;
}

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
};

function designPreviewPlugin() {
  return {
    name: "aisdlc-design-preview",
    configureServer(server) {
      // List of tickets and their screens, scanned at request time so new/updated prototypes appear on refresh.
      server.middlewares.use("/api/designs", (req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(scanDesigns()));
      });
      // Serve prototype files: /prototype/<TICKET>/<file> (defaults to index.html).
      server.middlewares.use("/prototype/", (req, res) => {
        const url = decodeURIComponent((req.url || "").split("?")[0]);
        const parts = url.replace(/^\/+/, "").split("/");
        const ticket = parts.shift();
        const file = parts.join("/") || "index.html";
        const resolved = resolvePrototypeFile(ticket, file);
        if (!resolved) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        res.setHeader("Content-Type", CONTENT_TYPES[path.extname(resolved).toLowerCase()] || "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        fs.createReadStream(resolved).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: here,
  server: { port: 4173, open: false },
  plugins: [designPreviewPlugin()],
});
