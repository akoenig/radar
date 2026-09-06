import { Effect, Layer } from "effect"
import type { CatalogTopic } from "../../../domain/model/Catalog.js"
import { FeedCatalog } from "../../../domain/ports/FeedCatalog.js"

/**
 * A hand-picked starting library, grouped by topic. Entries carry both the
 * feed URL and the site URL: if a publisher moves their feed, the client can
 * retry against the site and let autodiscovery find the new address.
 */
export const CATALOG: ReadonlyArray<CatalogTopic> = [
  {
    id: "technology",
    name: "Technology",
    description: "Reporting and analysis on computing, the internet, and the industry around them.",
    feeds: [
      {
        id: "hacker-news",
        title: "Hacker News",
        description: "The front page of the startup and programming community.",
        url: "https://news.ycombinator.com/rss",
        siteUrl: "https://news.ycombinator.com/",
      },
      {
        id: "ars-technica",
        title: "Ars Technica",
        description: "Long-running technology news with unusually deep technical reporting.",
        url: "https://feeds.arstechnica.com/arstechnica/index",
        siteUrl: "https://arstechnica.com/",
      },
      {
        id: "the-verge",
        title: "The Verge",
        description: "Technology, science, and culture, with a strong design sensibility.",
        url: "https://www.theverge.com/rss/index.xml",
        siteUrl: "https://www.theverge.com/",
      },
      {
        id: "404-media",
        title: "404 Media",
        description: "Journalist-owned reporting on technology, power, and the internet's underside.",
        url: "https://www.404media.co/rss/",
        siteUrl: "https://www.404media.co/",
      },
      {
        id: "krebs-on-security",
        title: "Krebs on Security",
        description: "Brian Krebs on breaches, fraud, and the economics of cybercrime.",
        url: "https://krebsonsecurity.com/feed/",
        siteUrl: "https://krebsonsecurity.com/",
      },
      {
        id: "lwn",
        title: "LWN.net",
        description: "Authoritative coverage of the Linux kernel and free software development.",
        url: "https://lwn.net/headlines/newrss",
        siteUrl: "https://lwn.net/",
      },
    ],
  },
  {
    id: "engineering",
    name: "Engineering",
    description: "How software actually gets built, from the people building it.",
    feeds: [
      {
        id: "cloudflare-blog",
        title: "The Cloudflare Blog",
        description: "Deep posts on networking, performance, and internet-scale infrastructure.",
        url: "https://blog.cloudflare.com/rss/",
        siteUrl: "https://blog.cloudflare.com/",
      },
      {
        id: "github-blog",
        title: "The GitHub Blog",
        description: "Product news and engineering write-ups from GitHub.",
        url: "https://github.blog/feed/",
        siteUrl: "https://github.blog/",
      },
      {
        id: "martin-fowler",
        title: "Martin Fowler",
        description: "Essays on architecture, refactoring, and software design.",
        url: "https://martinfowler.com/feed.atom",
        siteUrl: "https://martinfowler.com/",
      },
      {
        id: "rust-blog",
        title: "Rust Blog",
        description: "Release notes and project news from the Rust team.",
        url: "https://blog.rust-lang.org/feed.xml",
        siteUrl: "https://blog.rust-lang.org/",
      },
      {
        id: "go-blog",
        title: "The Go Blog",
        description: "Language design, tooling, and release news from the Go team.",
        url: "https://go.dev/blog/feed.atom",
        siteUrl: "https://go.dev/blog/",
      },
      {
        id: "netflix-tech",
        title: "Netflix TechBlog",
        description: "Distributed systems and data engineering at streaming scale.",
        url: "https://netflixtechblog.com/feed",
        siteUrl: "https://netflixtechblog.com/",
      },
    ],
  },
  {
    id: "people",
    name: "Independent voices",
    description: "Individual writers, publishing on their own terms.",
    feeds: [
      {
        id: "simon-willison",
        title: "Simon Willison",
        description: "Prolific notes on Python, SQLite, and applied language models.",
        url: "https://simonwillison.net/atom/everything/",
        siteUrl: "https://simonwillison.net/",
      },
      {
        id: "julia-evans",
        title: "Julia Evans",
        description: "Patient, illustrated explanations of systems and debugging.",
        url: "https://jvns.ca/atom.xml",
        siteUrl: "https://jvns.ca/",
      },
      {
        id: "dan-luu",
        title: "Dan Luu",
        description: "Data-heavy essays on performance, reliability, and industry folklore.",
        url: "https://danluu.com/atom.xml",
        siteUrl: "https://danluu.com/",
      },
      {
        id: "kottke",
        title: "kottke.org",
        description: "One of the oldest blogs on the web: a daily miscellany of good things.",
        url: "https://feeds.kottke.org/main",
        siteUrl: "https://kottke.org/",
      },
      {
        id: "austin-kleon",
        title: "Austin Kleon",
        description: "Short posts on creative work and stealing like an artist.",
        url: "https://austinkleon.com/feed/",
        siteUrl: "https://austinkleon.com/",
      },
    ],
  },
  {
    id: "science",
    name: "Science",
    description: "Research and discovery, explained for people outside the lab.",
    feeds: [
      {
        id: "quanta",
        title: "Quanta Magazine",
        description: "Beautifully edited reporting on mathematics and fundamental science.",
        url: "https://www.quantamagazine.org/feed/",
        siteUrl: "https://www.quantamagazine.org/",
      },
      {
        id: "phys-org",
        title: "Phys.org",
        description: "A steady stream of research news across the physical sciences.",
        url: "https://phys.org/rss-feed/",
        siteUrl: "https://phys.org/",
      },
      {
        id: "science-daily",
        title: "ScienceDaily",
        description: "Press-release-driven coverage of new studies across every field.",
        url: "https://www.sciencedaily.com/rss/all.xml",
        siteUrl: "https://www.sciencedaily.com/",
      },
      {
        id: "nasa",
        title: "NASA",
        description: "Missions, imagery, and announcements from the agency.",
        url: "https://www.nasa.gov/feed/",
        siteUrl: "https://www.nasa.gov/",
      },
    ],
  },
  {
    id: "design",
    name: "Design & the web",
    description: "Craft, interface, and the practice of building for the browser.",
    feeds: [
      {
        id: "smashing",
        title: "Smashing Magazine",
        description: "Practical front-end and design articles, generously illustrated.",
        url: "https://www.smashingmagazine.com/feed/",
        siteUrl: "https://www.smashingmagazine.com/",
      },
      {
        id: "css-tricks",
        title: "CSS-Tricks",
        description: "Techniques, demos, and reference material for CSS and layout.",
        url: "https://css-tricks.com/feed/",
        siteUrl: "https://css-tricks.com/",
      },
      {
        id: "nn-group",
        title: "Nielsen Norman Group",
        description: "Usability research distilled into short, evidence-based articles.",
        url: "https://www.nngroup.com/feed/rss/",
        siteUrl: "https://www.nngroup.com/",
      },
      {
        id: "a-list-apart",
        title: "A List Apart",
        description: "Standards, craft, and the culture of web design since 1998.",
        url: "https://alistapart.com/main/feed/",
        siteUrl: "https://alistapart.com/",
      },
    ],
  },
  {
    id: "world",
    name: "News",
    description: "General-interest reporting, for a baseline of what happened today.",
    feeds: [
      {
        id: "bbc-world",
        title: "BBC News — World",
        description: "Concise international headlines, updated continuously.",
        url: "https://feeds.bbci.co.uk/news/world/rss.xml",
        siteUrl: "https://www.bbc.com/news/world",
      },
      {
        id: "guardian-world",
        title: "The Guardian — World",
        description: "International reporting and analysis.",
        url: "https://www.theguardian.com/world/rss",
        siteUrl: "https://www.theguardian.com/world",
      },
      {
        id: "npr",
        title: "NPR News",
        description: "US and world news from public radio.",
        url: "https://feeds.npr.org/1001/rss.xml",
        siteUrl: "https://www.npr.org/",
      },
      {
        id: "al-jazeera",
        title: "Al Jazeera",
        description: "International news with strong coverage outside the West.",
        url: "https://www.aljazeera.com/xml/rss/all.xml",
        siteUrl: "https://www.aljazeera.com/",
      },
    ],
  },
  {
    id: "ideas",
    name: "Ideas & long reads",
    description: "Essays worth sitting down with.",
    feeds: [
      {
        id: "aeon",
        title: "Aeon",
        description: "Philosophy, psychology, and culture at essay length.",
        url: "https://aeon.co/feed.rss",
        siteUrl: "https://aeon.co/",
      },
      {
        id: "the-marginalian",
        title: "The Marginalian",
        description: "Maria Popova on literature, art, and how to live.",
        url: "https://www.themarginalian.org/feed/",
        siteUrl: "https://www.themarginalian.org/",
      },
      {
        id: "longreads",
        title: "Longreads",
        description: "Curated picks of the best long-form journalism on the web.",
        url: "https://longreads.com/rss/",
        siteUrl: "https://longreads.com/",
      },
      {
        id: "marginal-revolution",
        title: "Marginal Revolution",
        description: "Tyler Cowen and Alex Tabarrok on economics and everything else.",
        url: "https://marginalrevolution.com/feed",
        siteUrl: "https://marginalrevolution.com/",
      },
    ],
  },
]

export const StaticFeedCatalogLive = Layer.succeed(FeedCatalog, { topics: Effect.succeed(CATALOG) })
