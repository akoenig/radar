import DOMPurify from "dompurify"

const purifier = DOMPurify()

// Open links in a new tab and keep referrers private; lazy-load images.
purifier.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank")
    node.setAttribute("rel", "noopener noreferrer")
  }
  if (node.tagName === "IMG") {
    node.setAttribute("loading", "lazy")
    node.setAttribute("decoding", "async")
    node.setAttribute("referrerpolicy", "no-referrer")
  }
})

const CONFIG: Parameters<typeof purifier.sanitize>[1] = {
  USE_PROFILES: { html: true },
  // Publisher styling fights our typography; drop it.
  FORBID_ATTR: ["style", "class", "id", "width", "height", "bgcolor", "align", "color", "face"],
  FORBID_TAGS: ["style", "font", "form", "input", "button", "select", "textarea"],
  ADD_ATTR: ["target", "loading", "decoding", "referrerpolicy"],
}

export const sanitize = (html: string): string => purifier.sanitize(html, CONFIG) as string

/** Resolve relative URLs in article markup against the article's own URL. */
export const absolutize = (html: string, base: string | null): string => {
  if (!base) return html
  let origin: URL
  try {
    origin = new URL(base)
  } catch {
    return html
  }
  return html.replace(/(src|href)=("|')(?!https?:|mailto:|data:|#|\/\/)([^"']+)\2/gi, (_m, attr: string, quote: string, value: string) => {
    try {
      return `${attr}=${quote}${new URL(value, origin).toString()}${quote}`
    } catch {
      return `${attr}=${quote}${value}${quote}`
    }
  })
}
