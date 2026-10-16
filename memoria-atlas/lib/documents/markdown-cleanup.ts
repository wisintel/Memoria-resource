export function cleanMarkdownArtifacts(markdown: string) {
  return markdown
    .replace(/&lt;\s*br\s*\/?\s*&gt;/gi, "<br>")
    .replace(/<\/?u>/gi, "")
    .replace(/<sup>([\s\S]*?)<\/sup>/gi, "$1")
    .replace(/<sub>([\s\S]*?)<\/sub>/gi, "$1")
    .replace(/\s*\[(?:\\?\[\d+\\?\])+\]\(#page-[^)]+\)/g, "")
    .replace(/\s+([.,;:!?])/g, "$1");
}
