#!/usr/bin/env node
/**
 * sync.mjs - build-time generator for the read-only aisdlc docs site.
 *
 * Reads (and ONLY reads) from the control-plane repository one level above web/:
 *   - config/repositories.yaml                 (registry; JSON-compatible YAML)
 *   - repositories/<repo>/*.md                 (repository knowledge package)
 *   - repositories/<repo>/repository.yaml      (provenance / identity)
 *   - repositories/<repo>/metadata.json        (provenance / analysis metadata)
 *   - system/**                                (architecture, domains, decisions, product, ...)
 *   - tasks/<ticket>/task.yaml                 (ONLY task id, type and status are extracted)
 *
 * It never reads logs/, credentials/, secrets/, .git/ or any other tasks/ artifact. Every file
 * access goes through readAllowed(), which enforces that allow-list.
 *
 * Before anything is written, ALL source text that was read and ALL generated pages are scanned for
 * secrets (AWS keys, private key headers, password/token/api_key assignments, ...). A match fails
 * the build with exit code 1 and nothing is generated. Matched values are never printed.
 *
 * Output (all git-ignored): docs/repos/**, docs/system/**, docs/status.md, .vitepress/generated-nav.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.resolve(HERE, '..')
const ROOT = path.resolve(process.env.AISDLC_ROOT || path.join(WEB, '..'))
const DOCS = path.join(WEB, 'docs')
const NAV_FILE = path.join(WEB, '.vitepress', 'generated-nav.json')

const STALE_AFTER_DAYS = 30
const PREFERRED_REPO_PAGES = [
  'overview', 'structure', 'architecture', 'dependencies', 'interfaces', 'data-model',
  'testing', 'build-release', 'security', 'conventions', 'change-impact',
]
const SYSTEM_GROUP_ORDER = ['architecture', 'domains', 'integrations', 'data-flows', 'decisions', 'product']
const FRESHNESS_STATUSES = new Set(['current', 'needs-refresh', 'stale', 'non-compliant'])

// ---------------------------------------------------------------------------------------------
// Secret scanning
// ---------------------------------------------------------------------------------------------

const SIMPLE_SECRET_RULES = [
  ['AWS access key id', /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA|AIPA)[0-9A-Z]{16}\b/],
  ['AWS secret access key', /aws_?secret_?access_?key["']?\s*[:=]\s*["']?[A-Za-z0-9/+=]{30,}/i],
  ['Private key header', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/],
  ['JSON web token', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Bearer token', /\bBearer\s+[A-Za-z0-9._~+/-]{24,}=*/],
  ['Credentials embedded in URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@<>]+:[^\s@/<>]{3,}@[^\s/]/i],
]

// password / token / api_key style assignments, e.g.  db_password = "hunter2hunter2"  or  api_key: Ab12Cd34Ef
const ASSIGNMENT_RE =
  /([\w.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credential)[\w.-]*)(["']?)\s*(:=|=>|:|=)\s*(["']?)([^\s"'`,;]+)/gi
const PLACEHOLDER_VALUE_RE =
  /^(?:x{3,}|\*+|\.{3,}|redacted|\[redacted]|changeme|change-me|your[-_].*|example.*|placeholder.*|dummy.*|null|nil|none|undefined|true|false|string|env.*|process\.env.*|secret(?:s)?|token|password)$/i

function isPlaceholder(value) {
  if (/^[<${%*]/.test(value) || /[<>]/.test(value)) return true
  if (/^\{\{/.test(value) || /^\$/.test(value)) return true
  return PLACEHOLDER_VALUE_RE.test(value)
}

function scanText(text) {
  const findings = []
  const lines = text.split(/\r?\n/)
  lines.forEach((line, i) => {
    for (const [name, re] of SIMPLE_SECRET_RULES) {
      if (re.test(line)) findings.push({ line: i + 1, rule: name })
    }
    ASSIGNMENT_RE.lastIndex = 0
    let m
    while ((m = ASSIGNMENT_RE.exec(line))) {
      const [, , , op, quote, value] = m
      if (value.length < 6 || isPlaceholder(value)) continue
      // file:line references (token.v2.util.js:87-101) and OAuth metadata fields (token_use=access) are not secrets
      if (/^\d+(?:-\d+)?$/.test(value) && /\.[a-z]{1,5}$/i.test(m[1])) continue
      if (/^(?:token|access|id|refresh)[_-](?:use|type)$/i.test(m[1])) continue
      // "=" / ":=" / "=>" assignments and quoted values are flagged outright. Unquoted "key: value"
      // pairs are common in prose, so they additionally need a digit or symbol to count as a secret.
      const strong = op !== ':' || quote !== '' || /[0-9!@#$%^&*+/=~]/.test(value)
      if (strong) findings.push({ line: i + 1, rule: 'Credential assignment (password/token/api_key)' })
    }
  })
  return findings
}

const secretFindings = []
function scan(label, text) {
  for (const f of scanText(text)) secretFindings.push({ label, ...f })
}

// ---------------------------------------------------------------------------------------------
// Guarded file access
// ---------------------------------------------------------------------------------------------

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/')

const FORBIDDEN_SEGMENTS = new Set(['logs', 'credentials', 'secrets', '.git', 'node_modules'])
const FORBIDDEN_FILE_RE = /(^\.env|\.pem$|\.key$|\.p12$|\.pfx$|^id_rsa|^id_ed25519|\.kdbx$)/i

function assertSafe(abs) {
  const r = rel(abs)
  if (r.startsWith('..') || path.isAbsolute(r)) throw new Error(`Refusing to read outside the workspace: ${abs}`)
  const parts = r.split('/')
  if (parts.some((s) => FORBIDDEN_SEGMENTS.has(s)) || FORBIDDEN_FILE_RE.test(parts.at(-1))) {
    throw new Error(`Refusing to read protected path: ${r}`)
  }
  return r
}

const ALLOWED_READ = [
  /^config\/repositories\.yaml$/,
  /^repositories\/[^/]+\/[^/]+\.(md|yaml|yml|json)$/i,
  /^system\/.+\.(md|yaml|yml|json)$/i,
  /^tasks\/[^/]+\/task\.yaml$/,
]

/** The single choke point for reading source content. Scans what it reads. */
function readAllowed(abs) {
  const r = assertSafe(abs)
  if (!ALLOWED_READ.some((re) => re.test(r))) throw new Error(`Path is not on the read allow-list: ${r}`)
  const text = fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '')
  // task.yaml is parsed only to extract id/type/status; the secret scan still covers it.
  scan(`source ${r}`, text)
  return text
}

function listDir(abs) {
  assertSafe(abs)
  return fs.existsSync(abs) ? fs.readdirSync(abs, { withFileTypes: true }) : []
}

const warnings = []
const warn = (m) => warnings.push(m)

function safeSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'page'
}

// ---------------------------------------------------------------------------------------------
// Markdown / HTML helpers
// ---------------------------------------------------------------------------------------------

const escHtml = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\{/g, '&#123;').replace(/\}/g, '&#125;')

const escCell = (v) =>
  String(v ?? '')
    .replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;').replace(/\}/g, '&#125;')

function fenceFor(text) {
  const longest = Math.max(2, ...(text.match(/`+/g) || []).map((s) => s.length))
  return '`'.repeat(longest + 1)
}

/**
 * Make arbitrary repository markdown safe to compile in VitePress/Vue: escape `{{`/`}}` and raw
 * `<tag>` text outside fenced and inline code, strip front matter.
 */
function sanitizeMarkdown(raw) {
  let text = raw.replace(/\r\n?/g, '\n')
  text = text.replace(/^---\n[\s\S]*?\n---\n?/, '')
  const out = []
  let fence = null
  for (const line of text.split('\n')) {
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && /^\s{0,3}[`~]+\s*$/.test(line)) fence = null
      out.push(line)
      continue
    }
    if (f) { fence = f[1]; out.push(line); continue }
    const segs = line.split(/(`[^`\n]*`)/)
    out.push(
      segs
        .map((s, i) =>
          i % 2 === 1
            ? s
            : s
                .replace(/\{\{/g, '&#123;&#123;').replace(/\}\}/g, '&#125;&#125;')
                .replace(/<(?!https?:\/\/|mailto:)(?=[A-Za-z/!?])/g, '&lt;'),
        )
        .join(''),
    )
  }
  return out.join('\n')
}

function firstHeading(md) {
  let fence = false
  for (const line of md.split('\n')) {
    if (/^\s{0,3}(```|~~~)/.test(line)) fence = !fence
    if (fence) continue
    const m = line.match(/^#\s+(.+?)\s*#*\s*$/)
    if (m) return m[1].replace(/[`*_]/g, '').trim()
  }
  return null
}

/** Insert `block` right after the first H1 (or prepend an H1 + block when there is none). */
function insertAfterH1(md, fallbackTitle, block) {
  const lines = md.split('\n')
  let fence = false
  for (let i = 0; i < lines.length; i++) {
    if (/^\s{0,3}(```|~~~)/.test(lines[i])) fence = !fence
    if (!fence && /^#\s+\S/.test(lines[i])) {
      lines.splice(i + 1, 0, '', block, '')
      return lines.join('\n')
    }
  }
  return `# ${fallbackTitle}\n\n${block}\n\n${md}`
}

const humanize = (s) => s.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

// ---------------------------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------------------------

function parseYaml(text) {
  return YAML.parse(text)
}

function parseRegistry() {
  const file = path.join(ROOT, 'config', 'repositories.yaml')
  if (!fs.existsSync(file)) {
    warn('config/repositories.yaml not found; treating registry as empty.')
    return []
  }
  const text = readAllowed(file).split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join('\n')
  let doc
  try {
    doc = text.trim() ? parseYaml(text) : {}
  } catch (e) {
    throw new Error(`config/repositories.yaml is not valid JSON-compatible YAML: ${e.message.split('\n')[0]}`)
  }
  let repos = doc?.repositories ?? {}
  if (Array.isArray(repos)) repos = Object.fromEntries(repos.filter((r) => r?.name).map((r) => [r.name, r]))
  const out = []
  for (const [name, def] of Object.entries(repos || {})) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
      warn(`Skipping repository with unsafe name: ${JSON.stringify(name)}`)
      continue
    }
    out.push({ name, ...(def && typeof def === 'object' ? def : {}) })
  }
  return out
}

/** Look a key up at the top level and inside common provenance containers. */
function pick(obj, keys, containers = ['repository', 'provenance', 'knowledge', 'analysis']) {
  if (!obj || typeof obj !== 'object') return undefined
  for (const k of keys) if (obj[k] != null && typeof obj[k] !== 'object') return obj[k]
  for (const c of containers) {
    const sub = obj[c]
    if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
      for (const k of keys) if (sub[k] != null && typeof sub[k] !== 'object') return sub[k]
    }
  }
  return undefined
}

function loadStructured(abs, kind) {
  if (!fs.existsSync(abs)) return { present: false, data: null, text: null }
  const text = readAllowed(abs)
  try {
    return { present: true, data: kind === 'json' ? JSON.parse(text) : parseYaml(text), text }
  } catch (e) {
    warn(`${rel(abs)} could not be parsed (${e.message.split('\n')[0]}); showing it as plain text only.`)
    return { present: true, data: null, text }
  }
}

function provenanceFor(repoYaml, metaJson) {
  const ry = repoYaml.data, mj = metaJson.data
  const first = (...vals) => vals.find((v) => v != null && v !== '')
  const cands = [pick(mj, ['knowledge_status']), pick(ry, ['knowledge_status']), pick(mj, ['status']), pick(ry, ['status'])].filter((v) => v != null && v !== '')
  const status = cands.find((v) => !FRESHNESS_STATUSES.has(String(v))) ?? cands[0]
  return {
    analyzed_commit: first(pick(mj, ['analyzed_commit']), pick(ry, ['analyzed_commit'])),
    analyzed_at: first(pick(mj, ['analyzed_at']), pick(ry, ['analyzed_at'])),
    status,
    confidence: first(pick(mj, ['confidence']), pick(ry, ['confidence'])),
    generator_version: first(pick(mj, ['generator_version']), pick(ry, ['generator_version'])),
    freshness_status: [pick(ry, ['status']), pick(mj, ['status'])].find((s) => FRESHNESS_STATUSES.has(String(s))),
  }
}

function computeFreshness(prov, registryEntry, hasPackage) {
  const now = Date.now()
  const t = prov.analyzed_at ? Date.parse(String(prov.analyzed_at)) : NaN
  const ageDays = Number.isNaN(t) ? null : Math.floor((now - t) / 86400000)
  const nonCompliant = registryEntry.base_branch !== undefined && registryEntry.base_branch !== 'main'
  let label = 'unknown', level = 'unknown'
  if (!hasPackage) {
    label = 'no-knowledge-package'; level = 'bad'
  } else if (['needs-refresh', 'stale'].includes(prov.freshness_status)) {
    label = 'needs-refresh'; level = 'warn'
  } else if (ageDays !== null && ageDays > STALE_AFTER_DAYS) {
    label = 'aged'; level = 'warn'
  } else if (prov.freshness_status === 'current' || ageDays !== null) {
    label = 'current'; level = 'ok'
  }
  const parts = []
  if (!hasPackage) {
    parts.push('No knowledge package was found under repositories/ for this repository. Run /aisdlc:refresh-repo ' + registryEntry.name + ' (or re-run /aisdlc:add-repo).')
  } else {
    if (prov.analyzed_commit) parts.push(`This knowledge describes commit ${prov.analyzed_commit}`)
    else parts.push('No analyzed commit is recorded')
    if (ageDays !== null) parts.push(`analyzed ${ageDays} day${ageDays === 1 ? '' : 's'} before this site was built`)
    else parts.push('analysis time is unknown')
    let note = parts.join(', ') + '.'
    if (label === 'needs-refresh') note += ' The package is marked as needing a refresh.'
    else if (label === 'aged') note += ` That is older than ${STALE_AFTER_DAYS} days, so it may be out of date.`
    else if (label === 'unknown') note += ' Freshness cannot be determined.'
    note += ` This site cannot see the source repository's current HEAD; run /aisdlc:status or /aisdlc:refresh-repo ${registryEntry.name} in Claude Code to check and update.`
    parts.length = 0
    parts.push(note)
  }
  if (nonCompliant) {
    parts.push(` Non-compliant: base_branch is "${registryEntry.base_branch}" but managed repositories must use "main"; it cannot enter an implementation workflow until remediated.`)
  }
  return { label, level, ageDays, nonCompliant, note: parts.join('') }
}

function provBadgeHtml(prov, fresh) {
  const chip = (k, v, cls = '') =>
    `<span class="chip ${cls}"><b>${escHtml(k)}</b> ${v == null || v === '' ? '<i>not recorded</i>' : escHtml(v)}</span>`
  const statusCls = prov.status ? `status-${String(prov.status).replace(/[^a-z-]/gi, '').toLowerCase()}` : ''
  const confCls = prov.confidence ? `conf-${String(prov.confidence).replace(/[^a-z-]/gi, '').toLowerCase()}` : ''
  return [
    `<div class="aisdlc-prov" data-freshness="${fresh.level}">`,
    `<div class="chips">`,
    chip('analyzed_commit', prov.analyzed_commit),
    chip('status', prov.status, statusCls),
    chip('confidence', prov.confidence, confCls),
    chip('analyzed_at', prov.analyzed_at),
    `<span class="chip fresh fresh-${fresh.level}"><b>freshness</b> ${escHtml(fresh.label)}</span>`,
    `</div>`,
    `<p class="fresh-note">${escHtml(fresh.note)}</p>`,
    `</div>`,
  ].join('\n')
}

// ---------------------------------------------------------------------------------------------
// Page collection
// ---------------------------------------------------------------------------------------------

/** pages: Map<docs-relative path, markdown> */
const pages = new Map()
function addPage(relPath, content) {
  if (pages.has(relPath)) warn(`Duplicate generated page ${relPath}; the later one wins.`)
  pages.set(relPath, content)
}

const asList = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])
const listText = (v) => asList(v).map(String).join(', ') || '-'

function repoPageLink(name, registeredNames) {
  return registeredNames.has(name) ? `[${escCell(name)}](/repos/${safeSlug(name)}/)` : escCell(name)
}

function buildRepos(registry) {
  const registered = new Set(registry.map((r) => r.name))
  const summaries = []
  const sidebarItems = []

  for (const repo of registry) {
    const slug = safeSlug(repo.name)
    const dir = path.join(ROOT, 'repositories', repo.name)
    const hasPackage = fs.existsSync(dir) && fs.statSync(dir).isDirectory()
    if (!hasPackage) warn(`Registered repository '${repo.name}' has no repositories/${repo.name}/ package.`)

    const repoYaml = hasPackage ? loadStructured(path.join(dir, 'repository.yaml'), 'yaml') : { present: false }
    const metaJson = hasPackage ? loadStructured(path.join(dir, 'metadata.json'), 'json') : { present: false }
    const prov = provenanceFor(repoYaml, metaJson)
    const fresh = computeFreshness(prov, repo, hasPackage)
    const badge = provBadgeHtml(prov, fresh)

    // copied knowledge pages: top-level *.md only
    const mdFiles = hasPackage
      ? listDir(dir).filter((e) => e.isFile() && /\.md$/i.test(e.name)).map((e) => e.name)
      : []
    const rank = (n) => {
      const i = PREFERRED_REPO_PAGES.indexOf(n.replace(/\.md$/i, '').toLowerCase())
      return i === -1 ? 1000 : i
    }
    mdFiles.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))

    const pageEntries = []
    for (const file of mdFiles) {
      let outName = safeSlug(file.replace(/\.md$/i, ''))
      if (outName === 'index') outName = 'source-index'
      const raw = readAllowed(path.join(dir, file))
      const body = sanitizeMarkdown(raw)
      const title = firstHeading(body) || humanize(file)
      const content = insertAfterH1(body, title, badge)
      addPage(`repos/${slug}/${outName}.md`, content)
      pageEntries.push({ text: title, link: `/repos/${slug}/${outName}`, file })
    }

    // summary page (index.md)
    const lines = []
    lines.push(`# ${escCell(repo.name)}`, '', badge, '')
    lines.push('## Registry entry', '')
    lines.push('| Field | Value |', '|---|---|')
    lines.push(`| Role | ${escCell(repo.role ?? '-')} |`)
    lines.push('| Local path | configured per developer in `claude.env` (not stored in the registry) |')
    lines.push(`| Base branch | ${escCell(repo.base_branch ?? '-')}${fresh.nonCompliant ? ' (non-compliant)' : ''} |`)
    lines.push(`| Domains | ${escCell(listText(repo.domains))} |`)
    lines.push(`| Depends on | ${asList(repo.depends_on).length ? asList(repo.depends_on).map((d) => repoPageLink(String(d), registered)).join(', ') : '-'} |`)
    lines.push(`| Provides | ${escCell(listText(repo.provides))} |`)
    if (repo.deployment && typeof repo.deployment === 'object') {
      lines.push(`| Deployment | ${escCell(Object.entries(repo.deployment).map(([k, v]) => `${k}: ${v}`).join(', '))} |`)
    }
    if (prov.generator_version) lines.push(`| Generator version | ${escCell(prov.generator_version)} |`)
    lines.push('')
    lines.push('## Knowledge package', '')
    if (!hasPackage) {
      lines.push(`::: warning No knowledge package`, `\`repositories/${repo.name}/\` does not exist. Run \`/aisdlc:refresh-repo ${repo.name}\` or re-run \`/aisdlc:add-repo\` to generate it.`, ':::', '')
    } else if (!pageEntries.length) {
      lines.push('The package contains no Markdown pages yet.', '')
    } else {
      for (const p of pageEntries) lines.push(`- [${escCell(p.text)}](${p.link}) <small>(${escCell(p.file)})</small>`)
      lines.push('')
      const missing = PREFERRED_REPO_PAGES.filter((n) => !mdFiles.some((f) => f.toLowerCase() === `${n}.md`))
      if (missing.length) lines.push(`Not present: ${missing.map((m) => `\`${m}.md\``).join(', ')}.`, '')
    }
    for (const [label, doc, lang] of [['repository.yaml', repoYaml, 'yaml'], ['metadata.json', metaJson, 'json']]) {
      if (doc.present && doc.text != null) {
        const fence = fenceFor(doc.text)
        lines.push(`::: details ${label}`, '', `${fence}${lang}`, doc.text.replace(/\s+$/, ''), fence, '', ':::', '')
      }
    }
    addPage(`repos/${slug}/index.md`, lines.join('\n'))

    sidebarItems.push({
      text: repo.name,
      collapsed: registry.length > 3,
      items: [{ text: 'Summary', link: `/repos/${slug}/` }, ...pageEntries.map(({ text, link }) => ({ text, link }))],
    })
    summaries.push({ repo, slug, prov, fresh, hasPackage })
  }

  // repositories index
  const idx = ['# Repositories', '']
  if (!registry.length) {
    idx.push(
      '::: info No repositories registered yet',
      'The registry (`config/repositories.yaml`) is empty, so there is no repository documentation to browse.',
      ':::', '',
      '## Register your first repository', '',
      'In Claude Code, with the aisdlc plugin loaded from the workspace repository, run:', '',
      '```text', '/aisdlc:add-repo <repo-name> <repo-path>', '```', '',
      'for example `/aisdlc:add-repo backend ../company-backend`. Onboarding is read-only: aisdlc resolves the path, confirms it is a Git repository with a `main` branch, studies it (identity, structure, architecture, dependencies, interfaces, data model, testing, build and release, security, conventions, change impact) and writes a knowledge package to `repositories/<repo-name>/` including `repository.yaml` and `metadata.json` with provenance.', '',
      'Then rebuild this site (`npm run build`, or restart `npm run dev`) and each registered repository appears here with its provenance badge and freshness note.', '',
      'See [Getting started](/guide/getting-started) for the full setup.', '',
    )
  } else {
    idx.push(`${registry.length} registered ${registry.length === 1 ? 'repository' : 'repositories'}. Each page carries a provenance badge (analyzed commit, status, confidence, analyzed at) and a freshness note.`, '')
    idx.push('| Repository | Role | Domains | Freshness | Analyzed commit | Status | Confidence |', '|---|---|---|---|---|---|---|')
    for (const s of summaries) {
      idx.push(`| [${escCell(s.repo.name)}](/repos/${s.slug}/) | ${escCell(s.repo.role ?? '-')} | ${escCell(listText(s.repo.domains))} | ${escCell(s.fresh.label)}${s.fresh.nonCompliant ? ' / non-compliant' : ''} | ${escCell(s.prov.analyzed_commit ?? '-')} | ${escCell(s.prov.status ?? '-')} | ${escCell(s.prov.confidence ?? '-')} |`)
    }
    idx.push('')
  }
  addPage('repos/index.md', idx.join('\n'))

  return { summaries, sidebarItems }
}

// ---- system/** -----------------------------------------------------------------------------

function walkSystem(dirAbs, relParts = []) {
  const files = []
  for (const e of listDir(dirAbs).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dirAbs, e.name)
    if (FORBIDDEN_SEGMENTS.has(e.name) || FORBIDDEN_FILE_RE.test(e.name) || e.name.startsWith('.')) continue
    if (e.isSymbolicLink()) continue
    if (e.isDirectory()) files.push(...walkSystem(abs, [...relParts, e.name]))
    else if (e.isFile() && /\.(md|ya?ml|json)$/i.test(e.name)) files.push({ abs, parts: [...relParts, e.name] })
  }
  return files
}

function scalarCell(v) {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function catalogRows(doc) {
  const toRows = (x) =>
    Array.isArray(x)
      ? x.map((r) => (r && typeof r === 'object' && !Array.isArray(r) ? r : { value: r }))
      : Object.entries(x).map(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? { id: k, ...v } : { id: k, value: v }))
  if (Array.isArray(doc)) return toRows(doc)
  if (!doc || typeof doc !== 'object') return []
  for (const k of ['features', 'capabilities', 'catalog', 'items']) {
    if (doc[k] && typeof doc[k] === 'object') return toRows(doc[k])
  }
  const container = Object.values(doc).find((v) => v && typeof v === 'object')
  const scalarOnly = Object.values(doc).every((v) => v == null || typeof v !== 'object')
  if (container && !scalarOnly) return toRows(container)
  return []
}

function renderCatalog(text) {
  let doc
  const out = ['# Feature catalog', '', 'Structured index of durable product capabilities, rendered from `system/product/feature-catalog.yaml`.', '']
  try {
    doc = parseYaml(text)
  } catch (e) {
    warn(`system/product/feature-catalog.yaml could not be parsed (${e.message.split('\n')[0]}).`)
    const fence = fenceFor(text)
    out.push('::: warning Could not parse', 'The catalog is not valid YAML; the raw text is shown below.', ':::', '', `${fence}yaml`, text.replace(/\s+$/, ''), fence)
    return out.join('\n')
  }
  const rows = catalogRows(doc)
  if (!rows.length) {
    out.push('::: info Empty catalog', 'No features have been recorded yet. The catalog is updated by `/aisdlc:post-release` after a feature reaches production.', ':::')
    return out.join('\n')
  }
  const preferred = ['id', 'name', 'title', 'status', 'capability', 'capabilities', 'domain', 'domains', 'repositories', 'released_in', 'released_at', 'description', 'summary']
  const seen = new Set()
  for (const r of rows) for (const k of Object.keys(r)) seen.add(k)
  const cols = [...preferred.filter((k) => seen.has(k)), ...[...seen].filter((k) => !preferred.includes(k))]
  out.push(`${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}.`, '')
  out.push(`| ${cols.map(escCell).join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`)
  for (const r of rows) {
    out.push(`| ${cols.map((c) => escCell(scalarCell(r[c]).slice(0, 400))).join(' | ')} |`)
  }
  return out.join('\n')
}

function buildSystem(registry) {
  const base = path.join(ROOT, 'system')
  const entries = [] // { group: parts[], text, link, order }
  const files = fs.existsSync(base) ? walkSystem(base) : []

  for (const f of files) {
    const parts = f.parts.map((p, i) => (i === f.parts.length - 1 ? p : safeSlug(p)))
    const fileName = parts.at(-1)
    const ext = path.extname(fileName).toLowerCase()
    let slugName = safeSlug(fileName.replace(/\.[^.]+$/, ''))
    const dirParts = parts.slice(0, -1)
    if (/^readme$/i.test(slugName)) slugName = 'index'
    const raw = readAllowed(f.abs)
    const relKey = f.parts.join('/')
    let content, title
    if (ext === '.md') {
      content = sanitizeMarkdown(raw)
      // links into repositories/<repo>/<doc>.md become site links /repos/<repo>/<doc>
      content = content.replace(/\]\((?:\.{1,2}\/)+repositories\/([^/)#\s]+)\/?([^)#\s]*?)(?:\.md)?(#[^)\s]*)?\)/g, (_m, repo, doc, hash) => `](/repos/${repo}/${doc}${hash || ''})`)
      title = firstHeading(content) || humanize(fileName)
      if (!/^#\s+\S/m.test(content)) content = `# ${title}\n\n${content}`
    } else if (relKey === 'product/feature-catalog.yaml' || relKey === 'product/feature-catalog.yml') {
      content = renderCatalog(raw)
      title = 'Feature catalog'
      slugName = 'feature-catalog'
    } else {
      title = humanize(fileName)
      const fence = fenceFor(raw)
      content = `# ${title}\n\nSource: \`system/${relKey}\`\n\n${fence}${ext === '.json' ? 'json' : 'yaml'}\n${raw.replace(/\s+$/, '')}\n${fence}`
    }
    const outRel = ['system', ...dirParts, `${slugName}.md`].join('/')
    addPage(outRel, content)
    const link = '/' + ['system', ...dirParts, slugName === 'index' ? '' : slugName].join('/')
    entries.push({ dirParts, slugName, title, link })
  }

  // system index
  const idx = ['# System knowledge', '']
  if (!entries.some((e) => !(e.dirParts.length === 0 && e.slugName === 'index'))) {
    idx.push('::: info Nothing here yet', 'No system-level knowledge exists yet (`system/architecture`, `domains`, `integrations`, `data-flows`, `decisions` and `product`). It is created as repositories are onboarded (`/aisdlc:add-repo`) and as features are consolidated after release (`/aisdlc:post-release`).', ':::')
  } else {
    idx.push('Cross-repository architecture, domains, decisions and the durable product knowledge base, copied from `system/` at build time.', '')
  }
  if (!entries.some((e) => e.dirParts.length === 0 && e.slugName === 'index')) addPage('system/index.md', idx.join('\n'))

  // interactive relationship graph (system/repository-relationships.yaml + registry)
  let hasGraph = false
  const relFile = path.join(base, 'repository-relationships.yaml')
  if (fs.existsSync(relFile)) {
    const doc = parseYaml(readAllowed(relFile).split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join('\n')) || {}
    const edges = (doc.edges || []).map((e) => ({
      from: e.from, to: e.to, kind: e.kind, direction: e.direction, description: e.description, status: e.status, note: e.note,
    }))
    const payload = Buffer.from(unescape(encodeURIComponent(JSON.stringify({ registered: registry.map((r) => r.name), edges }))), 'binary').toString('base64')
    addPage('system/graph.md', `---\naside: false\npageClass: graph-page\n---\n\n# Relationship graph\n\nHow the registered repositories and their external systems connect, drawn from \`system/repository-relationships.yaml\`.\n\n<RepoGraph data="${payload}" />\n`)
    hasGraph = true
  }

  // sidebar tree
  const rootItems = []
  const groups = new Map()
  const groupFor = (dirParts) => {
    let items = rootItems, key = ''
    let node = null
    for (const p of dirParts) {
      key += '/' + p
      if (!groups.has(key)) {
        node = { text: humanize(p), collapsed: false, items: [], _key: p }
        groups.set(key, node)
        items.push(node)
      }
      node = groups.get(key)
      items = node.items
    }
    return items
  }
  const sorted = [...entries].sort((a, b) => {
    const ga = SYSTEM_GROUP_ORDER.indexOf(a.dirParts[0]), gb = SYSTEM_GROUP_ORDER.indexOf(b.dirParts[0])
    return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb) || a.dirParts.join('/').localeCompare(b.dirParts.join('/')) ||
      (a.slugName === 'index' ? -1 : b.slugName === 'index' ? 1 : 0) || a.title.localeCompare(b.title)
  })
  for (const e of sorted) {
    if (e.dirParts.length === 0 && e.slugName === 'index') continue
    groupFor(e.dirParts).push({ text: e.title, link: e.link })
  }
  // product: put the overview first, then the catalog
  const product = groups.get('/product')
  if (product) {
    const w = (i) => (/overview/i.test(i.link ?? '') ? 0 : /feature-catalog/.test(i.link ?? '') ? 1 : i.items ? 3 : 2)
    product.items.sort((a, b) => w(a) - w(b))
  }
  const sidebar = [{ text: 'System', items: [{ text: 'Overview', link: '/system/' }, ...(hasGraph ? [{ text: 'Relationship graph', link: '/system/graph' }] : [])] }, ...rootItems]
  return { sidebar, count: entries.length }
}

// ---- tasks (id/type/status ONLY) ------------------------------------------------------------

const ACTIVE_EXCLUDED = new Set(['COMPLETED', 'CANCELLED'])
const SAFE_FIELD_RE = /^[A-Za-z0-9_.:-]{1,64}$/
const field = (v) => (typeof v === 'string' || typeof v === 'number') && SAFE_FIELD_RE.test(String(v)) ? String(v) : '(invalid)'

function readTasks() {
  const base = path.join(ROOT, 'tasks')
  const tasks = []
  for (const e of listDir(base)) {
    if (!e.isDirectory() || e.name.startsWith('.') || !/^[A-Za-z0-9._-]+$/.test(e.name)) continue
    const file = path.join(base, e.name, 'task.yaml')
    if (!fs.existsSync(file)) continue
    let doc
    try { doc = parseYaml(readAllowed(file)) } catch {
      tasks.push({ id: e.name, type: '(unreadable)', status: '(unreadable)' })
      continue
    }
    // Deliberately extract nothing but these three fields.
    const t = doc && typeof doc === 'object' ? (doc.task && typeof doc.task === 'object' ? doc.task : doc) : {}
    tasks.push({ id: field(t.id ?? e.name), type: field(t.type), status: field(t.status) })
  }
  return tasks.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
}

function buildStatus(summaries, tasks) {
  const active = tasks.filter((t) => !ACTIVE_EXCLUDED.has(t.status))
  const lines = ['# Status', '']
  lines.push('A read-only snapshot mirroring `/aisdlc:status`, generated at build time (' + new Date().toISOString() + '). For live data, integrations and conflicts, run `/aisdlc:status` in Claude Code.', '')

  lines.push(`## Repositories: ${summaries.length}`, '')
  if (!summaries.length) {
    lines.push('::: info No repositories registered', 'Register one with `/aisdlc:add-repo <repo-name> <repo-path>`. See [Getting started](/guide/getting-started).', ':::', '')
  } else {
    lines.push('| Repository | Freshness | Analyzed commit | Analyzed at | Status | Confidence | Base branch |', '|---|---|---|---|---|---|---|')
    for (const s of summaries) {
      lines.push(`| [${escCell(s.repo.name)}](/repos/${s.slug}/) | ${escCell(s.fresh.label)}${s.fresh.ageDays != null ? ` (${s.fresh.ageDays}d)` : ''} | ${escCell(s.prov.analyzed_commit ?? '-')} | ${escCell(s.prov.analyzed_at ?? '-')} | ${escCell(s.prov.status ?? '-')} | ${escCell(s.prov.confidence ?? '-')} | ${escCell(s.repo.base_branch ?? '-')}${s.fresh.nonCompliant ? ' (non-compliant)' : ''} |`)
    }
    lines.push('')
  }

  lines.push(`## Active tasks: ${active.length}`, '')
  if (!active.length) lines.push('No active tasks.', '')
  else {
    lines.push('| Task | Type | Status |', '|---|---|---|')
    for (const t of active) lines.push(`| ${escCell(t.id)} | ${escCell(t.type)} | ${escCell(t.status)} |`)
    lines.push('', '<small>Only the task id, type and status are shown here. Task artifacts are never published by this site.</small>', '')
  }

  const pending = active.filter((t) => /^AWAITING_.*APPROVAL$|^WAITING_FOR_APPROVAL$|^SPEC_REVIEW_REQUIRED$/.test(t.status))
  lines.push(`## Pending approvals: ${pending.length}`, '')
  if (!pending.length) lines.push('None.', '')
  else { for (const t of pending) lines.push(`- ${escCell(t.id)}: ${escCell(t.status)}. Use \`/aisdlc:approve ${escCell(t.id)} <gate>\` or \`/aisdlc:reject\`.`); lines.push('') }

  const issues = []
  for (const s of summaries) {
    if (s.fresh.nonCompliant) issues.push(`Repository ${s.repo.name} is non-compliant (base_branch is "${s.repo.base_branch}", must be "main").`)
    if (!s.hasPackage) issues.push(`Repository ${s.repo.name} has no knowledge package.`)
    else if (['needs-refresh', 'aged'].includes(s.fresh.label)) issues.push(`${s.repo.name} knowledge ${s.fresh.label === 'aged' ? 'may be stale' : 'needs refresh'}.`)
  }
  for (const t of active) {
    if (['BLOCKED', 'CONFLICTED', 'FAILED', 'CI_FAILED', 'JIRA_CHANGED', 'WAITING_FOR_INPUT'].includes(t.status)) issues.push(`Task ${t.id} is ${t.status}.`)
  }
  lines.push(`## Blocking issues: ${issues.length}`, '')
  if (!issues.length) lines.push('None detected from the data this site can see.', '')
  else { for (const i of issues) lines.push(`- ${escCell(i)}`); lines.push('') }

  lines.push('## Integrations', '', 'Jira, Git hosting and CI connection state is a live property of your Claude Code session and is not visible to this static site. Run `/aisdlc:status` to see it, and read [When Jira is unavailable](/guide/jira-unavailable) if Jira is disconnected.', '')
  addPage('status.md', lines.join('\n'))
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

function removeGenerated() {
  for (const p of ['repos', 'system', 'status.md']) fs.rmSync(path.join(DOCS, p), { recursive: true, force: true })
  fs.rmSync(NAV_FILE, { force: true })
}

function main() {
  const registry = parseRegistry()
  const { summaries, sidebarItems } = buildRepos(registry)
  const system = buildSystem(registry)
  const tasks = readTasks()
  buildStatus(summaries, tasks)

  const nav = [
    { text: 'Guide', link: '/guide/', activeMatch: '^/guide/' },
    { text: 'Repositories', link: '/repos/', activeMatch: '^/repos/' },
    { text: 'System', link: '/system/', activeMatch: '^/system/' },
    { text: 'Status', link: '/status' },
  ]
  const sidebar = {
    '/repos/': [{ text: 'Repositories', items: [{ text: 'All repositories', link: '/repos/' }, { text: 'Status', link: '/status' }] }, ...sidebarItems],
    '/system/': system.sidebar,
  }
  const navJson = JSON.stringify({ nav, sidebar, counts: { repositories: registry.length, systemPages: system.count, activeTasks: tasks.filter((t) => !ACTIVE_EXCLUDED.has(t.status)).length } }, null, 2)

  // Secret scan over every generated page and the nav config (source text was scanned on read).
  for (const [p, content] of pages) scan(`page docs/${p}`, content)
  scan('generated-nav.json', navJson)

  if (secretFindings.length) {
    removeGenerated()
    console.error('\nSECRET SCAN FAILED - refusing to build. Nothing was generated.\n')
    const seen = new Set()
    for (const f of secretFindings) {
      const k = `${f.label}:${f.line}:${f.rule}`
      if (seen.has(k)) continue
      seen.add(k)
      console.error(`  ${f.label} line ${f.line}: ${f.rule}`)
    }
    console.error('\nMatched values are intentionally not printed. Remove the secret from the source file (and rotate it), then rebuild.')
    process.exit(1)
  }

  removeGenerated()
  for (const [p, content] of pages) {
    const target = path.join(DOCS, p)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content.endsWith('\n') ? content : content + '\n', 'utf8')
  }
  fs.mkdirSync(path.dirname(NAV_FILE), { recursive: true })
  fs.writeFileSync(NAV_FILE, navJson + '\n', 'utf8')

  for (const w of warnings) console.warn(`warning: ${w}`)
  console.log(`sync: ${registry.length} repositor${registry.length === 1 ? 'y' : 'ies'}, ${system.count} system file(s), ${tasks.length} task(s); ${pages.size} pages written; secret scan clean.`)
}

try {
  main()
} catch (e) {
  console.error(`sync failed: ${e.message}`)
  process.exit(1)
}
