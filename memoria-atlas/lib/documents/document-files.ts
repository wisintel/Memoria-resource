export function isMarkdownDocumentFile(file: File) {
  const name = file.name.toLowerCase();

  return (
    file.type === "text/markdown" ||
    name.endsWith(".md") ||
    name.endsWith(".markdown")
  );
}

export function isHtmlDocumentFile(file: File) {
  const name = file.name.toLowerCase();

  return (
    file.type === "text/html" || name.endsWith(".html") || name.endsWith(".htm")
  );
}

export function isImportableDocumentFile(file: File) {
  return isMarkdownDocumentFile(file) || isHtmlDocumentFile(file);
}

export function sourceTypeForDocumentFile(file: File) {
  return isHtmlDocumentFile(file) ? "html" : "markdown";
}

export function mimeTypeForDocumentFile(file: File) {
  if (file.type) {
    return file.type;
  }

  return isHtmlDocumentFile(file) ? "text/html" : "text/markdown";
}

export function titleFromFileName(filename: string) {
  return (
    filename
      .replace(/\.[^.]+$/i, "")
      .replaceAll(/[-_]+/g, " ")
      .trim() || "Untitled document"
  );
}
