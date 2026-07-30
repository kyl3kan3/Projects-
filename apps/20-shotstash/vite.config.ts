import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Frontend build for the Tauri shell. `tauri build` runs this via
 * beforeBuildCommand and picks up ../dist (see src-tauri/tauri.conf.json).
 */
export default defineConfig({
  plugins: [react()],
  // Tauri serves a fixed dev port and handles its own reload.
  server: { port: 5173, strictPort: true },
  // Keep the bundle debuggable in dev builds; Tauri strips it for release.
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  clearScreen: false,
});
