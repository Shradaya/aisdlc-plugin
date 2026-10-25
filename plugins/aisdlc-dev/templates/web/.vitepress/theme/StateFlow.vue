<script setup lang="ts">
interface Step {
  name: string
  gate?: string // gate label; renders the step as a checkpoint
  note?: string
  terminal?: boolean
}
interface Group {
  title: string
  steps: Step[]
}
defineProps<{ groups: Group[]; failure?: string[] }>()
</script>

<template>
  <div class="stateflow">
    <section v-for="g in groups" :key="g.title" class="sf-group">
      <h4>{{ g.title }}</h4>
      <ol>
        <li v-for="s in g.steps" :key="s.name" :class="{ gate: s.gate, terminal: s.terminal }">
          <code>{{ s.name }}</code>
          <span v-if="s.gate" class="badge">gate: {{ s.gate }}</span>
          <span v-if="s.note" class="note">{{ s.note }}</span>
        </li>
      </ol>
    </section>
    <section v-if="failure && failure.length" class="sf-group sf-fail">
      <h4>Failure and exception states (reachable from most states)</h4>
      <p>
        <code v-for="f in failure" :key="f">{{ f }}</code>
      </p>
    </section>
  </div>
</template>

<style scoped>
.stateflow { margin: 1.25rem 0; }
.sf-group { margin-bottom: 1rem; }
.sf-group h4 { margin: 0 0 .4rem; font-size: .85rem; letter-spacing: .04em; text-transform: uppercase; color: var(--vp-c-text-2); }
ol { list-style: none; margin: 0; padding: 0; border-left: 2px solid var(--vp-c-divider); }
li { position: relative; margin: 0; padding: .35rem 0 .35rem 1.25rem; display: flex; flex-wrap: wrap; gap: .4rem .6rem; align-items: baseline; }
li::before { content: ''; position: absolute; left: -6px; top: .95rem; width: 10px; height: 10px; border-radius: 50%; background: var(--vp-c-bg); border: 2px solid var(--vp-c-brand-1); }
li.gate::before { background: var(--vp-c-warning-1); border-color: var(--vp-c-warning-1); border-radius: 2px; }
li.terminal::before { background: var(--vp-c-brand-1); }
li code { font-weight: 600; }
.badge { font-size: .72rem; padding: .05rem .45rem; border-radius: 999px; background: var(--vp-c-warning-soft); color: var(--vp-c-warning-1); font-weight: 600; }
.note { font-size: .85rem; color: var(--vp-c-text-2); }
.sf-fail p { display: flex; flex-wrap: wrap; gap: .4rem; margin: 0; }
.sf-fail code { background: var(--vp-c-danger-soft); color: var(--vp-c-danger-1); }
</style>
