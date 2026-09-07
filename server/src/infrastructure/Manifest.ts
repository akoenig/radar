import { Effect } from "effect"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"

/**
 * Reads the one fact about `cloudinabottle.toml` the server needs at runtime:
 * which route prefixes the owner has opened to the internet.
 *
 * Router mode trusts the platform to authenticate callers of /mcp, which holds
 * only while /mcp sits behind the login. Listing it in `public_paths` quietly
 * removes that guard, and a comment cannot stop it — so the server checks the
 * manifest it was built from and refuses the mode instead.
 *
 * This is a deliberately narrow scan rather than a TOML parser: one array, in
 * one section, and anything it fails to understand leaves the mode as the
 * operator asked, which is the behaviour without the check at all.
 */

/** Drops `#` comments, so a commented-out example is not read as configuration. */
const stripComments = (toml: string): string =>
  toml
    .split("\n")
    .map((line) => {
      let quoted = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"' || ch === "'") quoted = !quoted
        else if (ch === "#" && !quoted) return line.slice(0, i)
      }
      return line
    })
    .join("\n")

export const publicPaths = (toml: string): ReadonlyArray<string> => {
  const body = stripComments(toml)
  // [ \t] rather than \s: \s spans newlines, which would put the section
  // boundary on the blank line before the header instead of after it.
  const header = /^[ \t]*\[routing\][ \t]*$/m.exec(body)
  if (header === null) return []
  const rest = body.slice(header.index + header[0].length)
  const end = rest.search(/^[ \t]*\[/m)
  const section = end === -1 ? rest : rest.slice(0, end)
  const array = /public_paths\s*=\s*\[([^\]]*)\]/.exec(section)
  if (array === null) return []
  return [...(array[1] ?? "").matchAll(/["']([^"']*)["']/g)].map((match) => match[1] ?? "")
}

/** `public_paths` entries are prefixes, so /api opens /api/anything too. */
export const isPublic = (paths: ReadonlyArray<string>, path: string): boolean =>
  paths.some((raw) => {
    const prefix = raw.trim().replace(/\/+$/, "")
    return prefix === "" || path.startsWith(prefix)
  })

/** `<repo>/cloudinabottle.toml`, whether running from `src/` via tsx or `dist/`. */
const manifestPath = fileURLToPath(new URL("../../../cloudinabottle.toml", import.meta.url))

/** The manifest, or null when there is none to read — a plain `docker run`, say. */
export const readManifest = Effect.tryPromise(() => readFile(resolve(manifestPath), "utf8")).pipe(
  Effect.catchCause(() => Effect.succeed(null)),
)
