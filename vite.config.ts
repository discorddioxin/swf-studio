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
  // bundled game data (manifest.json + fish-full/swfs/*.swf) ships as-is
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
    // accept the Arena preview host (proxied origin) in dev
    allowedHosts: true,
  },
  test: {
    environment: "node",
    // `debug/tools/vitest/*.dev.test.ts` are developer dumpers (see debug/README.md);
    // they are kept out of src/ so they never ship, but still run with the suite.
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.{ts,mjs}", "debug/tools/vitest/*.dev.test.ts"],
  },
});
