import { Effect, Layer } from "effect"
import { XMLParser } from "fast-xml-parser"
import { InvalidOpml } from "../../../domain/errors.js"
import {
  OpmlCodec,
  type OpmlCodecShape,
  type OpmlDocument,
  type OpmlFolder,
  type OpmlOutline,
} from "../../../domain/ports/OpmlCodec.js"

type Node = string | number | boolean | null | undefined | ReadonlyArray<Node> | { readonly [key: string]: Node }
type ObjectNode = { readonly [key: string]: Node }

const isObject = (n: Node): n is ObjectNode => typeof n === "object" && n !== null && !Array.isArray(n)
const asArray = (n: Node): ReadonlyArray<Node> => (Array.isArray(n) ? n : n === undefined || n === null ? [] : [n])
const attr = (n: ObjectNode, name: string): string | null => {
  const v = n[`@_${name}`]
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => name === "outline",
})

const escape = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const outlineXml = (o: OpmlOutline, indent: string): string =>
  `${indent}<outline type="rss" text="${escape(o.title)}" title="${escape(o.title)}" xmlUrl="${escape(o.xmlUrl)}"${
    o.htmlUrl ? ` htmlUrl="${escape(o.htmlUrl)}"` : ""
  }/>`

const folderXml = (f: OpmlFolder): string =>
  [
    `    <outline text="${escape(f.name)}" title="${escape(f.name)}">`,
    ...f.outlines.map((o) => outlineXml(o, "      ")),
    "    </outline>",
  ].join("\n")

const render: OpmlCodecShape["render"] = (doc: OpmlDocument) =>
  Effect.succeed(
    [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<opml version="2.0">`,
      `  <head>`,
      `    <title>${escape(doc.title)}</title>`,
      `    <dateCreated>${new Date().toUTCString()}</dateCreated>`,
      `  </head>`,
      `  <body>`,
      ...doc.uncategorized.map((o) => outlineXml(o, "    ")),
      ...doc.folders.map(folderXml),
      `  </body>`,
      `</opml>`,
      ``,
    ].join("\n"),
  )

const parse: OpmlCodecShape["parse"] = (xml: string) =>
  Effect.gen(function* () {
    const doc = yield* Effect.try({
      try: () => parser.parse(xml) as Node,
      catch: (e) => new InvalidOpml({ reason: `Malformed XML: ${(e as Error).message}` }),
    })
    if (!isObject(doc) || !isObject(doc.opml)) return yield* new InvalidOpml({ reason: "Missing <opml> root element" })
    const body = isObject(doc.opml.body) ? doc.opml.body : null
    if (!body) return yield* new InvalidOpml({ reason: "Missing <body> element" })
    const head = isObject(doc.opml.head) ? doc.opml.head : {}

    const uncategorized: Array<OpmlOutline> = []
    const folders: Array<OpmlFolder> = []

    const toOutline = (n: ObjectNode): OpmlOutline | null => {
      const xmlUrl = attr(n, "xmlUrl")
      if (!xmlUrl) return null
      return { title: attr(n, "title") ?? attr(n, "text") ?? xmlUrl, xmlUrl, htmlUrl: attr(n, "htmlUrl") }
    }

    /** Nested folders are flattened into "Parent / Child". */
    const walk = (nodes: ReadonlyArray<Node>, folder: string | null, into: Array<OpmlOutline>): void => {
      for (const n of nodes) {
        if (!isObject(n)) continue
        const outline = toOutline(n)
        if (outline) {
          into.push(outline)
          continue
        }
        const children = asArray(n.outline)
        if (children.length === 0) continue
        const name = attr(n, "title") ?? attr(n, "text") ?? "Imported"
        const fullName = folder ? `${folder} / ${name}` : name
        const bucket: Array<OpmlOutline> = []
        walk(children, fullName, bucket)
        if (bucket.length > 0) folders.push({ name: fullName, outlines: bucket })
      }
    }
    walk(asArray(body.outline), null, uncategorized)

    const title = typeof head.title === "string" ? head.title : "Imported subscriptions"
    return { title, uncategorized, folders } satisfies OpmlDocument
  })

export const FastXmlOpmlCodecLive = Layer.succeed(OpmlCodec, { parse, render })
