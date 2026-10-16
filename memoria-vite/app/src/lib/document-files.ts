export function isImportableDocument(file: File) {
  return isMarkdownDocumentFile(file) || isHtmlDocumentFile(file) || isPdfDocumentFile(file);
}

export function isMarkdownDocumentFile(file: File) {
  const name = file.name.toLowerCase();

  return file.type === "text/markdown" || name.endsWith(".md") || name.endsWith(".markdown");
}

export function isHtmlDocumentFile(file: File) {
  const name = file.name.toLowerCase();

  return file.type === "text/html" || name.endsWith(".html") || name.endsWith(".htm");
}

export function isPdfDocumentFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("error", () => reject(new Error("File could not be read.")));
    reader.addEventListener("load", () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const [, base64 = ""] = result.split(",", 2);

      if (!base64) {
        reject(new Error("File could not be encoded."));
        return;
      }

      resolve(base64);
    });
    reader.readAsDataURL(file);
  });
}

export function titleFromFileName(filename: string) {
  return filename.replace(/\.[^.]+$/i, "").replaceAll(/[-_]+/g, " ").trim() || "Untitled document";
}

export function mimeTypeForSource(sourceType: "html" | "markdown") {
  return sourceType === "html" ? "text/html" : "text/markdown";
}
