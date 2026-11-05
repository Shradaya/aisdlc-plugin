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

// Parse the plugin's JSON-compatible YAML (strip full-line '#' comments, then JSON.parse). Returns fallback on error.
function readYaml(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\s*#.*$/gm, "")); } catch { return fallback; }
}

// Load task-types.yaml for the design lifecycle from the workspace config.
function taskTypes() {
  return readYaml(path.join(workspaceRoot(), "config", "task-types.yaml"), {});
}

// The next-step hint for a task, reusing the task-types next_steps map the state CLI uses.
function nextStep(types, task) {
  const { id, type, status } = task;
  const ns = types.next_steps || {};
  const failure = (types.failure_states || []).includes(status);
  const entry = failure ? (ns.failure || {})[status] : (ns[type] || {})[status] || (ns.default || {})[status];
  if (!entry) return null;
  const [who, text] = entry;
  const label = { you: "You", claude: "Claude", none: "Done" }[who] || who;
  return { who: label, text: String(text).split("{T}").join(id) };
}

// Ticket state for the UI: ordered stages, current state, failure flag, reason, next step.
function ticketStatus(ticket) {
  if (!TICKET_RE.test(ticket || "")) return { ok: false, error: "invalid ticket" };
  const f = path.join(workspaceRoot(), "tasks", ticket, "task.yaml");
  if (!fs.existsSync(f)) return { ok: false, error: "no task yet", ticket };
  const task = readYaml(f, null);
  if (!task || !task.task) return { ok: false, error: "unreadable task", ticket };
  const types = taskTypes();
  const type = task.task.type;
  const lc = types[type] || types[types.other_types_use] || {};
  const states = lc.states || [];
  const status = task.task.status;
  const failure = (types.failure_states || []).includes(status);
  const approvals = task.approvals || {};
  return {
    ok: true,
    ticket,
    type,
    status,
    failure,
    resumeState: task.task.resume_state || null,
    reason: task.task.reason || null,
    states,
    currentIndex: states.indexOf(status),
    next: nextStep(types, task.task),
    designApproval: approvals.design ? approvals.design.status : null,
  };
}

// Where a ticket's prototype HTML lives: prefer designs/<TICKET>/prototype/, fall back to designs/<TICKET>/
// (some prototypes are authored directly in the ticket folder). Returns the resolved base dir or null.
function prototypeBase(root, ticket) {
  const withSub = path.join(root, "designs", ticket, "prototype");
  if (fs.existsSync(withSub) && fs.statSync(withSub).isDirectory()) return withSub;
  const bare = path.join(root, "designs", ticket);
  if (fs.existsSync(bare) && fs.statSync(bare).isDirectory()) return bare;
  return null;
}

// Scan designs/<TICKET>/ for prototypes. Each .html file is a "screen"; index.html is the default.
function scanDesigns() {
  const root = workspaceRoot();
  const designsDir = path.join(root, "designs");
  const out = [];
  if (!fs.existsSync(designsDir)) return out;
  for (const ticket of fs.readdirSync(designsDir)) {
    if (!TICKET_RE.test(ticket)) continue;
    const base = prototypeBase(root, ticket);
    if (!base) continue;
    const screens = fs
      .readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".html"))
      .map((e) => e.name)
      .sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)));
    if (screens.length) out.push({ ticket, screens });
  }
  return out.sort((a, b) => a.ticket.localeCompare(b.ticket));
}

// Safely resolve a requested prototype file, refusing path traversal outside the ticket's prototype base.
function resolvePrototypeFile(ticket, file) {
  if (!TICKET_RE.test(ticket)) return null;
  const root = workspaceRoot();
  const base = prototypeBase(root, ticket);
  if (!base) return null;
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
      // Returns { designs, root, designsDir, entries } so the UI can show what was scanned when nothing matches.
      server.middlewares.use("/api/designs", (req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        const root = workspaceRoot();
        const designsDir = path.join(root, "designs");
        let entries = [];
        try { entries = fs.existsSync(designsDir) ? fs.readdirSync(designsDir) : []; } catch {}
        res.end(JSON.stringify({ designs: scanDesigns(), root, designsDir, entries }));
      });
      // Ticket state: the lifecycle stages, the current state, and the next-step hint, from
      // tasks/<TICKET>/task.yaml + task-types.yaml. GET /api/status/<TICKET>.
      server.middlewares.use("/api/status", (req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        const url = decodeURIComponent((req.url || "").split("?")[0]);
        const ticket = url.replace(/^\/+/, "").split("/")[0];
        res.end(JSON.stringify(ticketStatus(ticket)));
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
