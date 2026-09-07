export interface Feed {
  readonly id: string
  readonly url: string
  readonly siteUrl: string | null
  readonly title: string
  readonly description: string | null
  readonly iconUrl: string | null
  readonly categoryId: string | null
  readonly position: number
  readonly lastFetchedAt: number | null
  readonly lastError: string | null
  readonly unread: number
  readonly createdAt: number
}

export interface Category {
  readonly id: string
  readonly name: string
  readonly position: number
}

export interface EntrySummary {
  readonly id: string
  readonly feedId: string
  readonly url: string | null
  readonly title: string
  readonly author: string | null
  readonly summary: string
  readonly publishedAt: number
  readonly isRead: boolean
  readonly isSaved: boolean
}

export interface Entry extends EntrySummary {
  readonly content: string | null
}

export interface EntryPage {
  readonly items: ReadonlyArray<EntrySummary>
  readonly next: string | null
}

export interface Stats {
  readonly unread: number
  readonly saved: number
}

export interface RefreshResult {
  readonly feedId: string
  readonly title: string
  readonly added: number
  readonly error: string | null
}

export interface ImportSummary {
  readonly feedsAdded: number
  readonly feedsSkipped: number
  readonly categoriesAdded: number
}

export interface DiscoveredFeed {
  readonly url: string
  readonly title: string | null
  readonly type: string | null
}

export type ApiErrorBody =
  | { readonly _tag: "NotFound"; readonly resource: string; readonly id: string }
  | { readonly _tag: "Conflict"; readonly message: string; readonly existingId: string | null }
  | { readonly _tag: "UnprocessableFeed"; readonly kind: string; readonly url: string; readonly message: string }
  | { readonly _tag: "BadRequest"; readonly message: string }
  | { readonly _tag: string; readonly message?: string }

export interface CatalogFeed {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly url: string
  readonly siteUrl: string
  readonly subscribedAs: string | null
}

export interface CatalogPreviewItem {
  readonly title: string
  readonly url: string | null
  readonly publishedAt: number | null
}

export interface CatalogTopic {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly feeds: ReadonlyArray<CatalogFeed>
}

export type View =
  | { readonly kind: "all" }
  | { readonly kind: "saved" }
  | { readonly kind: "discover" }
  | { readonly kind: "feed"; readonly id: string }
  | { readonly kind: "category"; readonly id: string }
