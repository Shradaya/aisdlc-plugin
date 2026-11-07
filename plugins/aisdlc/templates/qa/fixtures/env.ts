// Resolves the QA target environment for playwright.config.ts and the login setup, and refuses production.
// Same rules as the aisdlc-qa plugin's scripts/qa/env.js, repeated here so a plain `npx playwright test` is guarded too.
//   name:   QA_ENV (environment variable > .env > claude.env), else "default" in config/environments.yaml
//   usable: has a base_url, allow_automation is true, host not in blocked_hosts and not production-looking
//   blocked_hosts: "example.com" blocks that host and its subdomains; "=example.com" blocks only that exact host
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const readJsonYaml = (file: string) =>
  JSON.parse(fs.readFileSync(file, "utf8").replace(/^\s*#.*$/gm, ""));

function fileSettings(files = ["claude.env", ".env"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of files) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(
        /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/,
      );
      if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return out;
}

// A setting from the real environment, else from .env / claude.env. Never use it for credentials.
export const setting = (name: string): string | undefined =>
  process.env[name] ?? fileSettings()[name];

// A credential from the real environment, else from .env only (gitignored, and Claude is denied access to it).
// Never from claude.env, which Claude can read.
export const credential = (name: string): string | undefined =>
  process.env[name] || fileSettings([".env"])[name];

const DEFAULT_PRODUCTION = [
  "(^|[.-])prod([.-]|$)",
  "(^|[.-])production([.-]|$)",
  "(^|[.-])live([.-]|$)",
];

function productionPatterns(): RegExp[] {
  const override = path.join(ROOT, "config", "qa-policy.yaml");
  const list = fs.existsSync(override)
    ? readJsonYaml(override).environments?.blocked_host_patterns
    : undefined;
  return (list || DEFAULT_PRODUCTION).map((p: string) => new RegExp(p, "i"));
}

// Does a blocked_hosts entry cover this host? "=h" is exact; "h" also covers its subdomains.
export function hostBlocked(entry: string, host: string): boolean {
  const e = String(entry).toLowerCase();
  return e.startsWith("=")
    ? host === e.slice(1)
    : host === e || host.endsWith("." + e);
}

export type Login = {
  mode: "form" | "manual" | "none";
  path?: string;
  username_label?: string;
  password_label?: string;
  submit_name?: string;
  // Optional Playwright selectors (e.g. "#email", "[name=password]", "button[type=submit]"); they win over the labels.
  username_selector?: string;
  password_selector?: string;
  submit_selector?: string;
  success_url?: string;
};

export function qaTarget() {
  const cfg = readJsonYaml(path.join(ROOT, "config", "environments.yaml"));
  const name = setting("QA_ENV") || cfg.default;
  const env = (cfg.environments || {})[name];
  if (!env)
    throw new Error(
      `QA environment '${name}' is not defined in config/environments.yaml`,
    );
  if (!env.base_url)
    throw new Error(
      `QA environment '${name}' has no base_url in config/environments.yaml`,
    );
  if (env.allow_automation !== true)
    throw new Error(
      `QA environment '${name}' does not allow automation (allow_automation)`,
    );
  const host = new URL(env.base_url).hostname.toLowerCase();
  if (
    (cfg.blocked_hosts || []).some((h: string) => hostBlocked(h, host)) ||
    productionPatterns().some((p) => p.test(host))
  )
    throw new Error(
      `Refusing to test ${host}: automation never runs against production`,
    );
  return {
    name: name as string,
    baseURL: env.base_url as string,
    login: (env.login || { mode: "none" }) as Login,
    testIdAttribute: (env.test_id_attribute || "data-testid") as string,
    storageState: path.join(ROOT, ".auth", `${name}.json`),
  };
}
