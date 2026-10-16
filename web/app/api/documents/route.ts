import { NextRequest, NextResponse } from "next/server";
import { getDocumentFormOptions } from "@/services/documents";
import { loadDocumentShelfFolders } from "@/services/shelf";

// TODO(transport): Retained as a focused client read endpoint until form-option reads move to Server Components.
export async function GET(request: NextRequest) {
  const domainSlug = request.nextUrl.searchParams.get("domain")?.trim() ?? "";
  const include = request.nextUrl.searchParams.get("include");

  if (include === "options") {
    const [options, folders] = await Promise.all([
      getDocumentFormOptions(domainSlug),
      loadDocumentShelfFolders(domainSlug),
    ]);

    return NextResponse.json({
      folderItems: folders.folderItems,
      folders: folders.folders,
      options,
    });
  }

  return NextResponse.json(
    { error: "Unsupported document request" },
    { status: 400 }
  );
}
