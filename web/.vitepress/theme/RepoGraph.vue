<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed, watch } from 'vue'

// Interactive repository relationship graph. Data is passed base64-encoded by scripts/sync.mjs
// (derived from system/repository-relationships.yaml and config/repositories.yaml).
// Declutter model: only registered repos are shown by default; external systems appear when a
// repo is selected (its neighbours only) or when "show all external systems" is on.
const props = defineProps<{ data: string }>()
const model = JSON.parse(decodeURIComponent(escape(atob(props.data)))) as {
  registered: string[]
  edges: { from: string; to: string; kind: string; direction?: string; description?: string; status: string; evidence?: string[]; note?: string }[]
}

const KIND_COLORS: Record<string, string> = {
  api: '#2563eb', event: '#d97706', database: '#7c3aed', file: '#059669', 'third-party': '#9ca3af',
}
const kinds = [...new Set(model.edges.map((e) => e.kind))]
const enabledKinds = ref<string[]>(kinds.filter((k) => k !== 'third-party'))
const showExternal = ref(false)
const selected = ref<string | null>(null)
const container = ref<HTMLElement | null>(null)
let cy: any
let observer: MutationObserver | undefined

const registeredSet = new Set(model.registered)
const nodeIds = [...new Set([...model.registered, ...model.edges.flatMap((e) => [e.from, e.to])])]

const selectedEdges = computed(() =>
  selected.value ? model.edges.filter((e) => e.from === selected.value || e.to === selected.value) : [],
)

function palette() {
  const dark = document.documentElement.classList.contains('dark')
  return { text: dark ? '#e5e7eb' : '#1f2937', ext: dark ? '#4b5563' : '#e5e7eb', extBorder: '#9ca3af', bg: dark ? '#1b1b1f' : '#ffffff' }
}

function style() {
  const p = palette()
  return [
    { selector: 'node', style: { label: 'data(id)', 'font-size': 10, color: p.text, 'text-valign': 'bottom', 'text-margin-y': 4, 'background-color': p.ext, 'border-width': 1, 'border-color': p.extBorder, width: 14, height: 14, 'text-wrap': 'wrap', 'text-max-width': 110, 'text-background-color': p.bg, 'text-background-opacity': 0.8, 'text-background-padding': 2, 'min-zoomed-font-size': 7 } },
    { selector: 'node[registered]', style: { 'background-color': '#2563eb', 'border-color': '#1d4ed8', width: 44, height: 44, 'font-weight': 'bold', 'font-size': 13, 'text-margin-y': 6 } },
    { selector: 'edge', style: { width: 1.8, 'curve-style': 'bezier', 'control-point-step-size': 40, 'target-arrow-shape': 'triangle', 'line-color': 'data(color)', 'target-arrow-color': 'data(color)', opacity: 0.8, 'arrow-scale': 0.9 } },
    { selector: 'edge[status != "human-confirmed"]', style: { 'line-style': 'dashed', opacity: 0.55 } },
    { selector: '.hidden', style: { display: 'none' } },
    { selector: '.faded', style: { opacity: 0.1, 'text-opacity': 0.2 } },
    { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#f59e0b' } },
  ]
}

function elements() {
  return [
    ...nodeIds.map((id) => ({ data: { id, ...(registeredSet.has(id) ? { registered: true } : {}) } })),
    ...model.edges.map((e, i) => ({ data: { id: `e${i}`, source: e.from, target: e.to, kind: e.kind, status: e.status, color: KIND_COLORS[e.kind] ?? '#9ca3af' } })),
  ]
}

// Registered repos on a circle; each external system is fanned out radially beyond its anchor repo.
// Positions are computed once, so toggling visibility never re-flows the picture.
function layout() {
  const reg = cy.nodes('[registered]')
  const radius = Math.max(220, reg.length * 70)
  reg.layout({ name: 'circle', radius, animate: false, fit: false }).run()
  const center = { x: 0, y: 0 }
  reg.forEach((n: any) => { center.x += n.position('x') / reg.length; center.y += n.position('y') / reg.length })

  const groups = new Map<string, any[]>()
  cy.nodes('[!registered]').forEach((n: any) => {
    const anchors = n.neighborhood('node[registered]')
    const key = anchors.length ? anchors.map((a: any) => a.id()).sort().join('|') : '_'
    groups.set(key, [...(groups.get(key) ?? []), n])
  })
  for (const [key, list] of groups) {
    const anchors = key === '_' ? [] : key.split('|').map((id) => cy.getElementById(id))
    const a = anchors.length
      ? { x: anchors.reduce((s: number, n: any) => s + n.position('x'), 0) / anchors.length, y: anchors.reduce((s: number, n: any) => s + n.position('y'), 0) / anchors.length }
      : center
    const out = Math.atan2(a.y - center.y, a.x - center.x)
    const spread = Math.min(Math.PI * 0.9, 0.34 * list.length)
    list.forEach((n, i) => {
      const t = list.length === 1 ? 0 : -spread / 2 + (spread * i) / (list.length - 1)
      const r = 190 + (i % 2) * 60
      n.position({ x: a.x + Math.cos(out + t) * r, y: a.y + Math.sin(out + t) * r })
    })
  }
}

function apply() {
  if (!cy) return
  const sel = selected.value ? cy.getElementById(selected.value) : null
  cy.elements().removeClass('hidden faded')
  cy.edges().forEach((e: any) => { if (!enabledKinds.value.includes(e.data('kind'))) e.addClass('hidden') })
  cy.nodes('[!registered]').forEach((n: any) => {
    const near = sel && sel.length && (n.same(sel) || n.edgesWith(sel).filter((e: any) => !e.hasClass('hidden')).length > 0)
    const linked = n.connectedEdges().filter((e: any) => !e.hasClass('hidden')).length > 0
    if (!linked || !(showExternal.value || near)) n.addClass('hidden')
  })
  cy.edges().forEach((e: any) => { if (e.source().hasClass('hidden') || e.target().hasClass('hidden')) e.addClass('hidden') })
  cy.nodes().unselect()
  if (sel && sel.length) {
    sel.select()
    cy.elements().not(sel.closedNeighborhood()).addClass('faded')
  }
}

function fit() { cy?.fit(cy.elements().not('.hidden'), 50) }

onMounted(async () => {
  const { default: cytoscape } = await import('cytoscape')
  cy = cytoscape({ container: container.value, elements: elements(), style: style(), wheelSensitivity: 0.25, minZoom: 0.2, maxZoom: 3 })
  layout()
  apply()
  fit()
  cy.on('tap', 'node', (ev: any) => { selected.value = ev.target.id() })
  cy.on('tap', (ev: any) => { if (ev.target === cy) selected.value = null })
  observer = new MutationObserver(() => cy.style(style()))
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})
onBeforeUnmount(() => { observer?.disconnect(); cy?.destroy() })

watch([enabledKinds, showExternal], () => { apply(); fit() }, { deep: true })
watch(selected, () => { apply(); if (selected.value) fit() })
</script>

<template>
  <div class="rg">
    <div class="rg-controls">
      <label v-for="k in kinds" :key="k" class="rg-kind">
        <input v-model="enabledKinds" type="checkbox" :value="k" />
        <span class="rg-swatch" :style="{ background: KIND_COLORS[k] ?? '#9ca3af' }" />{{ k }}
      </label>
      <label class="rg-kind"><input v-model="showExternal" type="checkbox" /> show all external systems</label>
    </div>
    <div class="rg-body">
      <div ref="container" class="rg-canvas" />
      <aside class="rg-panel">
        <template v-if="selected">
          <h3>{{ selected }}</h3>
          <p class="rg-sub">{{ registeredSet.has(selected) ? 'Registered repository' : 'External (not a registered repository)' }} · {{ selectedEdges.length }} edge(s)</p>
          <div v-for="(e, i) in selectedEdges" :key="i" class="rg-edge">
            <div class="rg-edge-head">
              <span class="rg-swatch" :style="{ background: KIND_COLORS[e.kind] ?? '#9ca3af' }" />
              <strong>{{ e.from }}</strong> → <strong>{{ e.to }}</strong>
            </div>
            <div class="rg-sub">{{ e.kind }} · {{ e.status }}</div>
            <p v-if="e.description">{{ e.description }}</p>
            <p v-if="e.note" class="rg-sub">Note: {{ e.note }}</p>
          </div>
        </template>
        <p v-else class="rg-sub">Showing registered repositories only. Click a repo to reveal the external systems it connects to, or tick "show all external systems". Third-party links are off by default. Solid edges are human-confirmed; dashed are observed or inferred. Scroll to zoom, drag to pan.</p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.rg { margin: 16px 0; }
.rg-controls { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-bottom: 10px; font-size: 13px; }
.rg-kind { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
.rg-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
.rg-body { display: flex; gap: 12px; align-items: stretch; }
.rg-canvas { flex: 1 1 auto; height: calc(100vh - 230px); min-height: 520px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg-soft); }
.rg-panel { flex: 0 0 340px; max-height: calc(100vh - 230px); overflow-y: auto; border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 12px 14px; font-size: 13px; }
.rg-panel h3 { margin: 0 0 2px; font-size: 15px; }
.rg-sub { color: var(--vp-c-text-2); font-size: 12px; margin: 2px 0; }
.rg-edge { border-top: 1px solid var(--vp-c-divider); padding-top: 8px; margin-top: 8px; }
.rg-edge p { margin: 4px 0; line-height: 1.45; }
@media (max-width: 860px) { .rg-body { flex-direction: column; } .rg-panel { flex-basis: auto; max-height: 320px; } }
</style>
