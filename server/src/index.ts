/**
 * The server as a library.
 *
 * Radar runs in two shapes: a server someone deploys, and a desktop app that
 * embeds the very same stack in Electron's main process. Both build the one
 * composition root below — the desktop app is a second entry point, not a
 * second implementation.
 */
export { makeAppLayer, type AppLayerOptions } from "./infrastructure/AppLayer.js"
export type { AppConfigShape } from "./infrastructure/Config.js"
export { adoptLegacyDatabase } from "./infrastructure/LegacyDatabase.js"
