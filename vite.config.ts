import { existsSync } from "fs";
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
  // A deployment may ship bundled game sets in game-files/ (manifest.json → games/*.json
  // → SWFs; see src/lib/bundled.ts). The repo ships none: without the folder there is
  // no public dir, and the Loader simply offers no bundled games.
  publicDir: existsSync(path.resolve(__dirname, "game-files")) ? "game-files" : false,
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
    // `docs/debug/tools/vitest/*.dev.test.ts` are developer dumpers (see docs/debug/README.md):
    // they print, they do not assert, so they are not part of the suite. Run them with
    // `npm run test:debug` (vitest.debug.config.ts).
    include: ["src/**/*.test.{ts,tsx}", "transcom/transpiler/**/*.test.{ts,tsx}", "server/**/*.test.{ts,mjs}"],
  },
});
