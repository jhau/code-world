import { defineConfig } from "vite";

// The example worlds live one level up; serving them as the public dir means
// the renderer stays a pure static app (no backend) per CLAUDE.md.
export default defineConfig({
  publicDir: "../examples",
  server: { port: 5173, strictPort: true },
});
