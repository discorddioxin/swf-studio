import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  // bundled game data (manifest.json + games/*.json + the sets' .swf files) ships as-is
  publicDir: 'game-files',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  test: {
    environment: "node",
    // `docs/debug/tools/vitest/*.dev.test.ts` are developer dumpers (see docs/debug/README.md);
    // they are kept out of src/ so they never ship, but still run with the suite.
    include: ["src/**/*.test.{ts,tsx}", "transcom/transpiler/**/*.test.{ts,tsx}", "server/**/*.test.{ts,mjs}", "docs/debug/tools/vitest/*.dev.test.ts"],
  },
});
