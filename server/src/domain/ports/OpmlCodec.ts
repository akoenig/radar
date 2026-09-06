import { Context, Effect } from "effect"
import type { InvalidOpml } from "../errors.js"

export interface OpmlOutline {
  readonly title: string
  readonly xmlUrl: string
  readonly htmlUrl: string | null
}

export interface OpmlFolder {
  readonly name: string
  readonly outlines: ReadonlyArray<OpmlOutline>
}

export interface OpmlDocument {
  readonly title: string
  readonly uncategorized: ReadonlyArray<OpmlOutline>
  readonly folders: ReadonlyArray<OpmlFolder>
}

export interface OpmlCodecShape {
  readonly parse: (xml: string) => Effect.Effect<OpmlDocument, InvalidOpml>
  readonly render: (doc: OpmlDocument) => Effect.Effect<string>
}

export class OpmlCodec extends Context.Service<OpmlCodec, OpmlCodecShape>()("@reader/OpmlCodec") {}
