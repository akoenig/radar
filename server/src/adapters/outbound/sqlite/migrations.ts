/** Ordered, append-only. Never edit a migration that has shipped. */
export const MIGRATIONS: ReadonlyArray<string> = [
  `
  CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE feeds (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    site_url TEXT,
    title TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    last_fetched_at INTEGER,
    last_error TEXT,
    etag TEXT,
    last_modified TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX feeds_category ON feeds(category_id);

  CREATE TABLE entries (
    id TEXT PRIMARY KEY,
    feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    guid TEXT NOT NULL,
    url TEXT,
    title TEXT NOT NULL,
    author TEXT,
    summary TEXT NOT NULL,
    content TEXT,
    published_at INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    is_saved INTEGER NOT NULL DEFAULT 0,
    read_at INTEGER,
    saved_at INTEGER,
    UNIQUE (feed_id, guid)
  );
  CREATE INDEX entries_feed_published ON entries(feed_id, published_at DESC, id DESC);
  CREATE INDEX entries_published ON entries(published_at DESC, id DESC);
  CREATE INDEX entries_unread ON entries(is_read, published_at DESC, id DESC);
  CREATE INDEX entries_saved ON entries(is_saved, published_at DESC, id DESC);
  `,
]
