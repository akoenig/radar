import he from "he"

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

export const SUMMARY_LENGTH = 320

export const summarize = (html: string | null): string => (html ? truncate(htmlToText(html), SUMMARY_LENGTH) : "")

export const looksLikeHtml = (body: string): boolean => {
  const head = body.slice(0, 2048).toLowerCase()
  return /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]/.test(head)
}

export const resolveUrl = (href: string | null | undefined, base: string): string | null => {
  if (!href) return null
  try {
    return new URL(href.trim(), base).toString()
  } catch {
    return null
  }
}

export const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export const parseDate = (value: string | null | undefined): number | null => {
  if (!value) return null
  const ms = Date.parse(value.trim())
  return Number.isNaN(ms) ? null : ms
}

/** Decode a response body honoring its declared charset. */
export const decodeBody = (bytes: Uint8Array, contentType: string | undefined): string => {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1]
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 512))
  const fromXml = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1]
  const charset = (fromHeader ?? fromXml ?? "utf-8").toLowerCase()
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder("utf-8").decode(bytes)
  }
}
