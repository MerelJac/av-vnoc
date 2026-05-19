export function htmlToText(html: string): string {
  return html
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, (_, t) => `${stripTags(t).toUpperCase()}\n`)
    .replace(/<li[^>]*>(.*?)<\/li>/gi, (_, t) => `• ${stripTags(t)}\n`)
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, "");
}
