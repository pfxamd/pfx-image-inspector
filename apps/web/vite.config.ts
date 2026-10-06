import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.PFX_PUBLIC_BASE ?? "/",
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
