import he from "he"

/**
 * Pure text helpers, shared by the adapters that need them: the feed parser
 * builds summaries with these, and the MCP adapter uses them to hand agents
 * readable prose instead of markup.
 */
/** Reduce an HTML fragment to readable plain text. */
export const htmlToText = (html: string): string =>
  he
    .decode(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<\/(p|div|br|li|h[1-6]|blockquote|tr)>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    )
    .replace(/\s+/g, " ")
    .trim()

export const truncate = (text: string, max: number): string => {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
