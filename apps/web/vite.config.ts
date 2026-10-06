import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    include: ["@pfx/metadata-core"],
  },
  build: {
    target: "es2022",
  },
  worker: {
    format: "es",
  },
});
