#!/usr/bin/env node
// Checks the PM live status page (scripts/status/status-server.js) against a throwaway PM workspace: lifecycle
// timeline, the acceptance-criteria approval, documents, and the safety rules (read-only, localhost Host only,
// nothing outside tasks/<ticket>/, no .env / key files). No browser, no network to the outside.
// Usage: node test-status-page-pm.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, execFileSync } = require("child_process");

const PLUGIN = path.resolve(__dirname, "..", "..");
const SERVER = path.join(PLUGIN, "scripts/status/status-server.js");
const W = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-pm-status-"));
// Remove the temp workspace even when setup throws: a leftover one is found by other tests' workspace discovery.
process.on("exit", () => fs.rmSync(W, { recursive: true, force: true }));
const env = {
  ...process.env,
  AISDLC_ROOT: W,
  CLAUDE_PLUGIN_ROOT: PLUGIN,
  JIRA_EMAIL: "x",
};
for (const k of ["JIRA_API_TOKEN"]) delete env[k];
const put = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(W, rel)), { recursive: true });
  fs.writeFileSync(path.join(W, rel), text);
};
const json = (rel, o) => put(rel, JSON.stringify(o, null, 2));
const state = (...a) =>
  execFileSync(
    "node",
    [path.join(PLUGIN, "scripts/state/aisdlc-state.js"), ...a],
    { env, stdio: "pipe" },
  );
let failed = 0;
const check = (ok, name) => {
  console.log((ok ? "PASS " : "FAIL ") + name);
  if (!ok) failed++;
};

json("config/repositories.yaml", { repositories: {} });
json("config/workspace.yaml", { workspace: { name: "pm-test", kind: "pm" } });
json("config/integrations.yaml", {
  jira: {
    base_url: "https://example.atlassian.net",
    write: { update_description: false },
  },
});
put(".env", "SOMETHING=1\n");

const T = "PM-1";
state("init", T, "pm");
state("transition", T, "REQUIREMENT_GATHERING");
put(
  `tasks/${T}/jira.md`,
  "# PM-1: Sign in\n\n**Summary:** Let a user sign in with valid credentials\n",
);
put(
  `tasks/${T}/requirements.md`,
  "# Requirements\n\n- The user can sign in.\n",
);
put(
  `tasks/${T}/acceptance-criteria.md`,
  "# Acceptance criteria\n\n## AC1\nGiven valid credentials, the user signs in.\n",
);
state("transition", T, "ACCEPTANCE_CRITERIA_DEFINED");

// While waiting for the acceptance-criteria approval, it is a pending approval.
const waiting = JSON.parse(
  execFileSync("node", [SERVER, "--json"], { env, encoding: "utf8" }),
);

state("approve", T, "acceptance_criteria");
state("transition", T, "HANDED_OFF_TO_DEV");
put(`tasks/${T}/.secret.key`, "nope");
put("outside.md", "outside\n");
state("init", "PM-2", "pm");

const get = (port, p, host = "localhost", method = "GET") =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: p,
        method,
        headers: { Host: host },
        timeout: 5000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            code: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
            type: res.headers["content-type"] || "",
          }),
        );
      },
    );
    req.on("timeout", () =>
      req.destroy(new Error(`request to ${p} timed out`)),
    );
    req.on("error", reject);
    req.end();
  });

(async () => {
  check(
    waiting.pending_approvals.includes(T) &&
      waiting.tasks.find((t) => t.id === T).awaiting_approval ===
        "acceptance_criteria",
    "waiting for acceptance-criteria approval is a pending approval",
  );

  const s = JSON.parse(
    execFileSync("node", [SERVER, "--json"], { env, encoding: "utf8" }),
  );
  const t1 = s.tasks.find((t) => t.id === T);
  check(
    s.tasks.length === 2 &&
      t1.title === "Let a user sign in with valid credentials",
    "tickets listed, title from jira.md",
  );
  check(
    s.workspace.kind === "pm" && s.workspace.name === "pm-test",
    "workspace is PM",
  );
  check(
    t1.next && t1.next.who === "you" && t1.next.text.includes(T),
    "next step",
  );
  const cred = Object.fromEntries(s.credentials.map((c) => [c.name, c.set]));
  check(
    cred.JIRA_EMAIL === true &&
      cred.JIRA_API_TOKEN === false &&
      !JSON.stringify(s).includes("SOMETHING"),
    "credentials as set/missing, names only, no values",
  );
  check(
    s.credentials.every(
      (c) => c.name === "JIRA_EMAIL" || c.name === "JIRA_API_TOKEN",
    ),
    "PM credentials are Jira only",
  );

  // refuses to run outside an aisdlc workspace: no AISDLC_ROOT, and cwd is a bare temp folder with no
  // config/repositories.yaml marker, so resolveRoot() returns null and the server exits 1.
  const D = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-nows-"));
  const bareEnv = { ...env };
  delete bareEnv.AISDLC_ROOT;
  delete bareEnv.CLAUDE_PROJECT_DIR;
  let refused = false;
  try {
    execFileSync("node", [SERVER, "--json"], {
      env: bareEnv,
      cwd: D,
      stdio: "pipe",
    });
  } catch (e) {
    refused = e.status === 1;
  }
  check(refused, "refuses to run outside an aisdlc workspace");
  fs.rmSync(D, { recursive: true, force: true });

  // markdown export (no server)
  const md = execFileSync("node", [SERVER, "--markdown", T], {
    env,
    encoding: "utf8",
  });
  check(
    md.includes("# PM-1") &&
      /acceptance_criteria/.test(md) &&
      md.includes("Next ("),
    "markdown status includes state, approval and next step",
  );

  // html snapshot export (no server, no credential values, no local path)
  const snap = path.join(W, "snap.html");
  execFileSync("node", [SERVER, "--export", snap], { env, stdio: "pipe" });
  const snapHtml = fs.readFileSync(snap, "utf8");
  check(
    snapHtml.includes("aisdlc-snapshot") &&
      snapHtml.includes(T) &&
      !snapHtml.includes(W),
    "snapshot embeds data, no local workspace path",
  );

  const srv = spawn("node", [SERVER, "--port", "0"], { env });
  const port = await new Promise((resolve, reject) => {
    srv.stdout.on("data", (d) => {
      const m = String(d).match(/localhost:(\d+)/);
      if (m) resolve(Number(m[1]));
    });
    srv.on("exit", () => reject(new Error("server exited")));
  });
  try {
    check((await get(port, "/")).type.startsWith("text/html"), "page served");
    check(
      JSON.parse((await get(port, "/api/ping")).body).app ===
        "aisdlc-pm-status",
      "ping identifies the PM status app",
    );
    const d = JSON.parse((await get(port, `/api/tasks/${T}`)).body);
    const st = Object.fromEntries(d.timeline.map((x) => [x.state, x.status]));
    check(
      st.CREATED === "done" &&
        st.ACCEPTANCE_CRITERIA_DEFINED === "done" &&
        st.HANDED_OFF_TO_DEV === "current" &&
        st.COMPLETED === "future",
      "past, current and future states",
    );
    check(
      d.timeline
        .filter((x) => x.gate)
        .map((x) => x.state)
        .join() === "HANDED_OFF_TO_DESIGN,HANDED_OFF_TO_DEV",
      "approval-gated states marked as gates",
    );
    const ac = d.approvals.find((a) => a.gate === "acceptance_criteria");
    check(
      ac &&
        ac.status === "approved" &&
        ac.changed_since_approval === false &&
        ac.artifact === "acceptance-criteria.md",
      "acceptance-criteria approval, unchanged, pins the artifact",
    );
    const docs = d.documents.map((x) => x.path);
    check(
      docs.includes("jira.md") &&
        docs.includes("requirements.md") &&
        docs.includes("acceptance-criteria.md"),
      "documents listed",
    );
    check(
      !docs.some((p) => /\.secret\.key$/.test(p)),
      "key file left out of documents",
    );
    check(
      (await get(port, `/api/tasks/${T}/doc?path=requirements.md`)).code ===
        200,
      "a ticket document is served",
    );
    check(
      (await get(port, `/api/tasks/${T}/doc?path=.secret.key`)).code === 404,
      "key file refused",
    );
    check(
      (await get(port, `/api/tasks/${T}/doc?path=..%2F..%2Foutside.md`))
        .code === 404,
      "path traversal refused",
    );
    check(
      (await get(port, "/api/status", "evil.example")).code === 403,
      "foreign Host header refused",
    );
    check(
      (await get(port, "/api/status", "localhost", "POST")).code === 405,
      "non-GET refused",
    );

    // changing acceptance-criteria.md after approval shows as changed-since-approval
    fs.appendFileSync(
      path.join(W, `tasks/${T}/acceptance-criteria.md`),
      "\n## AC2\nAlso lock out after 5 tries.\n",
    );
    const d2 = JSON.parse((await get(port, `/api/tasks/${T}`)).body);
    check(
      d2.approvals.find((a) => a.gate === "acceptance_criteria")
        .changed_since_approval === true,
      "edit after approval flagged as changed",
    );

    const again = await new Promise((resolve) => {
      const p2 = spawn("node", [SERVER, "--port", String(port)], { env });
      let out = "";
      p2.stdout.on("data", (c) => (out += c));
      p2.on("exit", (code) => resolve({ code, out }));
    });
    check(
      again.code === 0 && again.out.includes("already running"),
      "second start on the same port reuses the running page",
    );
  } finally {
    srv.kill();
    fs.rmSync(W, { recursive: true, force: true });
  }
  console.log(failed ? `${failed} failed` : "all passed");
  process.exit(failed ? 1 : 0);
})();
