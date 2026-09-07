import { build } from "esbuild"
import { cp, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Bundles the main process, server and all, into one file.
 *
 * Radar has no native modules — SQLite comes from node:sqlite, which is part of
 * the runtime Electron already ships — so the whole backend can be a single
 * bundled file. That keeps the packaged app free of node_modules, which is
 * what usually goes wrong when packaging a pnpm workspace.
 */
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")

await rm(join(here, "dist"), { recursive: true, force: true })

await build({
  entryPoints: [join(here, "src/main.ts")],
  outfile: join(here, "dist/main.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  // Electron 44 runs Node 24; matching it keeps esbuild from down-levelling
  // syntax the runtime supports natively.
  target: "node24",
  // Provided by Electron itself, and not resolvable at build time.
  external: ["electron"],
  sourcemap: true,
  // Dual-published dependencies still reach for require() internally, and an
  // ESM bundle has none unless one is put back.
  banner: {
    js: [
      'import { createRequire as __createRequire } from "node:module";',
      'import { fileURLToPath as __fileURLToPath } from "node:url";',
      'import { dirname as __dirname_of } from "node:path";',
      "const require = __createRequire(import.meta.url);",
      "const __filename = __fileURLToPath(import.meta.url);",
      "const __dirname = __dirname_of(__filename);",
    ].join("\n"),
  },
  logLevel: "info",
})

// The client is served over loopback by the bundled server, exactly as it is
// when deployed, so the desktop app runs the same build as the browser one.
await cp(join(root, "web/dist"), join(here, "dist/web"), { recursive: true })

console.log("desktop bundle ready")
