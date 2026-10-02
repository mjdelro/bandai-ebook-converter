import { defineConfig } from "vite";

export default defineConfig({
  base: "/bandai-ebook-converter/",
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
