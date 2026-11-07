import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import StateFlow from "./StateFlow.vue";
import Mermaid from "./Mermaid.vue";
import RepoGraph from "./RepoGraph.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("StateFlow", StateFlow);
    app.component("Mermaid", Mermaid);
    app.component("RepoGraph", RepoGraph);
  },
} satisfies Theme;
