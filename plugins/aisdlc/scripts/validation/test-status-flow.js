#!/usr/bin/env node
// Regression tests found by the EL-0000 demo run: role status after hand-offs back and forth, git status paths, and the
// status page API (markdown and design pages only, read-only, localhost only). No model needed.
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  http = require("http");
const { spawn, spawnSync, execSync } = require("child_process");

const AISDLC = path.resolve(__dirname, "..", "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-status-"));
let fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`,
  );
};
const run = (script, args, cwd) =>
  spawnSync("node", [path.join(AISDLC, script), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, AISDLC_ROOT: cwd, CLAUDE_PLUGIN_ROOT: AISDLC },
  });
const flow = (cwd, args) => run("scripts/flow/flow.js", args, cwd);
const git = (cwd, c) =>
  execSync("git " + c, { cwd, stdio: "pipe", encoding: "utf8" });
const json = (r) => JSON.parse(r.stdout);
const writeJson = (f, o) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(o));
};
const state = (cwd, T, role, status, approvals = {}) =>
  writeJson(path.join(cwd, "tasks", T, `task.${role}.yaml`), {
    task: { id: T, type: role, status },
    approvals,
  });

const W = path.join(tmp, "repo");
fs.mkdirSync(W);
run("scripts/init/aisdlc-init.js", [W, "--role", "dev"], tmp);
git(W, "init -q -b main");
git(W, "config user.email t@t.io");
git(W, "config user.name t");
git(
  W,
  "add -A -- config tasks designs system repositories .gitignore CLAUDE.md",
);
git(W, 'commit -q -m "EL-0: scaffold"');

// ---- role status across hand-offs back and forth -------------------------------------------------------------------
const T = "EL-5";
const byRole = () =>
  Object.fromEntries(
    json(flow(W, ["derive", T])).tickets[0].roles.map((r) => [
      r.role,
      r.status,
    ]),
  );
state(W, T, "pm", "ACCEPTANCE_CRITERIA_DEFINED", {
  acceptance_criteria: { status: "approved" },
});
flow(W, ["handoff", T, "dev", "--from", "pm"]);
state(W, T, "dev", "MERGED");
t("dev active after the PM hand-off", byRole().dev, "active");
t(
  "dev hands off to QA",
  flow(W, ["handoff", T, "qa", "--from", "dev"]).status,
  0,
);
t("dev is done after handing off", byRole().dev, "done");
state(W, T, "qa", "RESULTS_SIGNED_OFF", { signoff: { status: "approved" } });
t(
  "QA hands the ticket back to dev (release)",
  flow(W, ["handoff", T, "dev", "--from", "qa"]).status,
  0,
);
t("dev is active again after a later hand-off to it", byRole().dev, "active");
state(W, T, "dev", "COMPLETED");
t("a role whose own task is COMPLETED shows done", byRole().dev, "done");

// ---- git status keeps the whole first path ------------------------------------------------------------------------
fs.appendFileSync(path.join(W, "config", "repositories.yaml"), "# changed\n");
const st = json(run("scripts/git/aisdlc-git.js", ["status"], W));
t(
  "a modified tracked file is listed with its full path",
  st.files.map((f) => f.file).includes("config/repositories.yaml"),
  true,
);
git(W, "checkout -q -- config");

// ---- status page API -----------------------------------------------------------------------------------------------
fs.writeFileSync(
  path.join(W, "tasks", T, "requirements.md"),
  "# EL-5: Requirements\n\n- one\n",
);
fs.writeFileSync(path.join(W, "tasks", T, "jira.md"), "# EL-5: Title\n");
fs.mkdirSync(path.join(W, "designs", T), { recursive: true });
fs.writeFileSync(path.join(W, "designs", T, "design.md"), "# design\n");
fs.writeFileSync(
  path.join(W, "designs", T, "Main.dc.html"),
  "<title>x</title>",
);
fs.writeFileSync(path.join(W, "designs", T, "support.js"), "// runtime");
fs.writeFileSync(path.join(W, "designs", T, "canvas.json"), "{}");

const PORT = 4300 + Math.floor(Math.random() * 90);
const get = (p, opts = {}) =>
  new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: PORT,
        path: p,
        method: opts.method || "GET",
        headers: opts.headers || {},
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body }),
        );
      },
    );
    req.on("error", () => resolve({ status: 0, body: "" }));
    req.end();
  });

(async () => {
  const server = spawn(
    "node",
    [
      path.join(AISDLC, "scripts/status/status-server.js"),
      "--port",
      String(PORT),
    ],
    { cwd: W, env: { ...process.env, AISDLC_ROOT: W }, stdio: "ignore" },
  );
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    up = (await get("/api/ping")).status === 200;
    if (!up) await new Promise((r) => setTimeout(r, 150));
  }
  t("status server starts", up, true);
  if (up) {
    const status = JSON.parse((await get("/api/status")).body);
    t(
      "status lists the ticket with its title",
      [status.tasks[0].id, status.tasks[0].title],
      [T, "Title"],
    );
    const d = JSON.parse((await get(`/api/tasks/${T}`)).body);
    t(
      "documents: markdown and design pages only",
      d.documents.map((x) => x.path).sort(),
      [
        `designs/${T}/Main.dc.html`,
        `designs/${T}/design.md`,
        `tasks/${T}/jira.md`,
        `tasks/${T}/requirements.md`,
      ],
    );
    const doc = (p) => get(`/api/tasks/${T}/doc?path=${encodeURIComponent(p)}`);
    t(
      "a markdown document is served",
      (await doc(`tasks/${T}/requirements.md`)).status,
      200,
    );
    t(
      "a design page is served as a document",
      (await doc(`designs/${T}/Main.dc.html`)).status,
      200,
    );
    t(
      "task state yaml is not served",
      (await doc(`tasks/${T}/task.pm.yaml`)).status,
      404,
    );
    t(
      "hand-off events are not served",
      (await doc(`tasks/${T}/handoffs/x.md`)).status,
      404,
    );
    t(
      "the design runtime and json are not served as documents",
      [
        (await doc(`designs/${T}/support.js`)).status,
        (await doc(`designs/${T}/canvas.json`)).status,
      ],
      [404, 404],
    );
    t(
      "path traversal is refused",
      (await doc(`tasks/${T}/../../config/workspace.yaml`)).status,
      404,
    );
    const page = await get(`/design/${T}/Main.dc.html`, {
      headers: { Origin: "null" },
    });
    t(
      "design file is served in a sandbox with CORS only for a null origin",
      [
        page.status,
        /sandbox/.test(page.headers["content-security-policy"]),
        page.headers["access-control-allow-origin"],
      ],
      [200, true, "null"],
    );
    t(
      "a design file without that origin gets no CORS header",
      (await get(`/design/${T}/Main.dc.html`)).headers[
        "access-control-allow-origin"
      ],
      undefined,
    );
    t(
      "read-only: POST is refused",
      (await get("/api/status", { method: "POST" })).status,
      405,
    );
    t(
      "a foreign Host header is refused",
      (await get("/api/status", { headers: { Host: "evil.example.com" } }))
        .status,
      403,
    );
  }
  server.kill();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
