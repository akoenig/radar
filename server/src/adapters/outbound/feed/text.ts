import { htmlToText, truncate } from "../../../shared/html.js"

export { htmlToText, truncate }
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
