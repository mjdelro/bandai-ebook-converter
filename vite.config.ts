import { defineConfig } from "vite";

export default defineConfig({
  base: "/bandai-manual-epub/",
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
