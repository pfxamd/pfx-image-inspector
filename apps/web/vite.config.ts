import { pfxReleasePlugin } from "../../scripts/pfx-release.mjs";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  plugins: [pfxReleasePlugin()],
  base: command === "build" ? "/pfx-image-inspector/" : "/",
  optimizeDeps: {
    include: ["@pfx/metadata-core"],
  },
  build: {
    target: "es2022",
  },
  worker: {
    format: "es",
  },
}));
