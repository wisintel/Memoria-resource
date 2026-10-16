import { NextRequest, NextResponse } from "next/server";
import { isShelfClassKey } from "@/domain/shelf";
import { loadDocumentShelfFolders, loadShelfItems } from "@/services/shelf";

// TODO(transport): Retained as a focused Shelf read endpoint until Shelf reads move to Server Components.
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const classParam = searchParams.get("class") ?? "";
  const domainSlug = searchParams.get("domain")?.trim() ?? "";
  const mapId = searchParams.get("map")?.trim() ?? "";
  const query = searchParams.get("q") ?? "";
  const limit = Number(searchParams.get("limit") ?? "50");

  if (!isShelfClassKey(classParam)) {
    return NextResponse.json(
      { error: "Unsupported shelf class" },
      { status: 400 }
    );
  }

  const items = await loadShelfItems({
    classKey: classParam,
    domainSlug,
    limit: Number.isFinite(limit) ? limit : undefined,
    mapId,
    query,
  });

  if (classParam === "document") {
    const folders = await loadDocumentShelfFolders(domainSlug);

    return NextResponse.json({
      items,
      folderItems: folders.folderItems,
      folders: folders.folders,
    });
  }

  return NextResponse.json({ items });
}
