#!/usr/bin/env node
// Repository relationship graph. Read-only; system/repository-relationships.yaml stays the source of truth.
// Usage: node scripts/graph/aisdlc-graph.js <stats|validate|neighbors|impact|mermaid> [repo] [--depth N] [--registered] [--min-status S]
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const STATUS_RANK = { conflicted: 0, inferred: 1, observed: 2, 'human-confirmed': 3 };
const KINDS = new Set(['api', 'event', 'database', 'file', 'third-party']);

// Files are JSON-compatible YAML: strip full-line # comments, then JSON.parse.
function load(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    .split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join('\n');
  return JSON.parse(text);
}

function build() {
  const registry = load('config/repositories.yaml').repositories;
  const { edges } = load('system/repository-relationships.yaml');
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, { id, registered: id in registry, out: [], in: [] });
    return nodes.get(id);
  };
  Object.keys(registry).forEach(node);
  for (const e of edges) {
    node(e.from).out.push(e);
    node(e.to).in.push(e);
  }
  return { registry, edges, nodes };
}

function validate({ registry, edges }) {
  const problems = [];
  edges.forEach((e, i) => {
    const tag = `edge #${i} ${e.from} -> ${e.to}`;
    if (!KINDS.has(e.kind)) problems.push(`${tag}: unknown kind "${e.kind}"`);
    if (!(e.status in STATUS_RANK)) problems.push(`${tag}: unknown status "${e.status}"`);
    if (!e.evidence || !e.evidence.length) problems.push(`${tag}: no evidence`);
    for (const [side, id, flag] of [['from', e.from, 'source_registered'], ['to', e.to, 'target_registered']]) {
      const reg = id in registry;
      if (flag in e && e[flag] !== reg) problems.push(`${tag}: ${flag}=${e[flag]} but ${id} ${reg ? 'is' : 'is not'} in repositories.yaml`);
      if (!(flag in e) && !reg) problems.push(`${tag}: ${side} "${id}" is unregistered but ${flag} is not set to false`);
    }
  });
  // depends_on in the registry should be backed by an edge, and vice versa for registered sources.
  const has = (a, b) => edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
  for (const [id, r] of Object.entries(registry)) {
    for (const d of r.depends_on || []) if (!has(id, d)) problems.push(`registry: ${id} depends_on ${d} but no edge exists`);
  }
  return problems;
}

// Undirected BFS: a change on either end of an edge can break the other end.
function impact(g, start, depth, { registered, minStatus }) {
  if (!g.nodes.has(start)) throw new Error(`unknown node: ${start}`);
  const min = STATUS_RANK[minStatus || 'inferred'];
  const seen = new Map([[start, { depth: 0, via: null }]]);
  let frontier = [start];
  for (let d = 1; d <= depth; d++) {
    const next = [];
    for (const id of frontier) {
      const n = g.nodes.get(id);
      const adj = [...n.out.map((e) => ({ e, other: e.to, dir: '->' })), ...n.in.map((e) => ({ e, other: e.from, dir: '<-' }))];
      for (const { e, other, dir } of adj) {
        if (STATUS_RANK[e.status] < min || seen.has(other)) continue;
        if (registered && !g.nodes.get(other).registered) continue;
        seen.set(other, { depth: d, via: { from: id, dir, kind: e.kind, status: e.status } });
        next.push(other);
      }
    }
    frontier = next;
  }
  return seen;
}

function mermaid(g) {
  const id = (s) => s.replace(/[^A-Za-z0-9]/g, '_');
  const lines = ['graph LR'];
  for (const n of g.nodes.values()) lines.push(`  ${id(n.id)}${n.registered ? `["${n.id}"]` : `("${n.id}")`}`);
  for (const e of g.edges) {
    const arrow = e.status === 'human-confirmed' ? '-->' : '-.->';
    lines.push(`  ${id(e.from)} ${arrow}|${e.kind}| ${id(e.to)}`);
  }
  lines.push('  classDef reg fill:#dbeafe,stroke:#2563eb;');
  lines.push(`  class ${[...g.nodes.values()].filter((n) => n.registered).map((n) => id(n.id)).join(',')} reg;`);
  return lines.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (n) => { const i = argv.indexOf(n); return i < 0 ? undefined : argv.splice(i, 2)[1]; };
  const registered = argv.includes('--registered') && argv.splice(argv.indexOf('--registered'), 1);
  const depth = Number(flag('--depth') || 1);
  const minStatus = flag('--min-status');
  const [cmd, repo] = argv;
  const g = build();

  switch (cmd) {
    case 'stats': {
      const byKind = {}; const byStatus = {};
      g.edges.forEach((e) => { byKind[e.kind] = (byKind[e.kind] || 0) + 1; byStatus[e.status] = (byStatus[e.status] || 0) + 1; });
      const reg = [...g.nodes.values()].filter((n) => n.registered).length;
      console.log(`nodes: ${g.nodes.size} (${reg} registered, ${g.nodes.size - reg} external)  edges: ${g.edges.length}`);
      console.log('by kind:  ', JSON.stringify(byKind));
      console.log('by status:', JSON.stringify(byStatus));
      const hubs = [...g.nodes.values()].map((n) => [n.id, n.in.length + n.out.length]).sort((a, b) => b[1] - a[1]).slice(0, 5);
      console.log('most connected:', hubs.map(([n, c]) => `${n}(${c})`).join(', '));
      break;
    }
    case 'validate': {
      const p = validate(g);
      if (p.length) { console.log(p.join('\n')); console.log(`\n${p.length} problem(s)`); process.exitCode = 1; } else console.log('OK');
      break;
    }
    case 'neighbors':
    case 'impact': {
      if (!repo) throw new Error(`usage: ${cmd} <repo>`);
      const res = impact(g, repo, cmd === 'neighbors' ? 1 : depth, { registered, minStatus });
      for (const [id, { depth: d, via }] of res) {
        if (!via) continue;
        const n = g.nodes.get(id);
        console.log(`${'  '.repeat(d - 1)}${d}. ${id}${n.registered ? '' : ' (external)'}  [${via.kind}, ${via.status}] ${via.dir} via ${via.from}`);
      }
      console.log(`\n${res.size - 1} node(s) within ${cmd === 'neighbors' ? 1 : depth} hop(s) of ${repo}`);
      break;
    }
    case 'mermaid':
      console.log(mermaid(g));
      break;
    default:
      console.error('usage: aisdlc-graph.js <stats|validate|neighbors|impact|mermaid> [repo] [--depth N] [--registered] [--min-status S]');
      process.exitCode = 2;
  }
}

try { main(); } catch (e) { console.error(e.message); process.exitCode = 2; }
