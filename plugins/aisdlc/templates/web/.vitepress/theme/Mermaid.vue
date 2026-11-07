<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";

const props = defineProps<{ code: string }>();
const svg = ref("");
const failed = ref(false);
const source = decodeURIComponent(escape(atob(props.code)));
let observer: MutationObserver | undefined;
let n = 0;

async function render() {
  try {
    const { default: mermaid } = await import("mermaid");
    const dark = document.documentElement.classList.contains("dark");
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: dark ? "dark" : "default",
    });
    const id = `mmd-${Date.now()}-${n++}-${Math.random().toString(36).slice(2, 7)}`;
    svg.value = (await mermaid.render(id, source)).svg;
    failed.value = false;
  } catch {
    failed.value = true;
  }
}

onMounted(() => {
  render();
  observer = new MutationObserver(() => render());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div class="mermaid-wrap">
    <div v-if="svg && !failed" class="mermaid-diagram" v-html="svg" />
    <pre v-else class="mermaid-fallback"><code>{{ source }}</code></pre>
  </div>
</template>

<style scoped>
.mermaid-wrap {
  margin: 16px 0;
  overflow-x: auto;
}
.mermaid-diagram :deep(svg) {
  max-width: none;
  height: auto;
}
.mermaid-fallback {
  padding: 12px 16px;
  background: var(--vp-code-block-bg);
  border-radius: 8px;
  font-size: 13px;
  overflow-x: auto;
}
</style>
