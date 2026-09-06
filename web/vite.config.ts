import react from "@vitejs/plugin-react"
import { build, defineConfig, type Plugin } from "vite"
import { readdirSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Compiles `src/sw.ts` into `dist/sw.js` after the app bundle exists, injecting
 * the precache list and a version derived from the built asset names. Building
 * the worker separately keeps it out of the module graph, where it would
 * otherwise be pulled into the page bundle.
 */
const serviceWorker = (): Plugin => ({
  name: "reader-service-worker",
  apply: "build",
  enforce: "post",
  closeBundle: {
    sequential: true,
    order: "post",
    async handler() {
      const outDir = resolve(import.meta.dirname, "dist")
      const assets = readdirSync(resolve(outDir, "assets")).map((f) => `/assets/${f}`)
      // Fonts and images are fetched lazily; precaching the shell is enough to boot offline.
      const precache = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg", ...assets.filter((a) => /\.(js|css)$/.test(a))]
      // The bundle hash changes whenever any source does, which is exactly when
      // the shell cache should be replaced.
      const version = /index-([A-Za-z0-9_-]+)\.js$/.exec(precache.find((a) => a.endsWith(".js")) ?? "")?.[1] ?? String(Date.now())

      await build({
        configFile: false,
        logLevel: "warn",
        publicDir: false,
        define: {
          __PRECACHE__: JSON.stringify(precache),
          __VERSION__: JSON.stringify(version),
        },
        build: {
          outDir,
          emptyOutDir: false,
          target: "es2022",
          lib: { entry: resolve(import.meta.dirname, "src/sw.ts"), formats: ["es"], fileName: () => "sw.js" },
          rollupOptions: { output: { entryFileNames: "sw.js" } },
        },
      })
    },
  },
})

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.API_URL ?? "http://localhost:8080", changeOrigin: true } },
  },
  build: { outDir: "dist", sourcemap: false, target: "es2022" },
})
