import { NextRequest, NextResponse } from "next/server";

import { createDomainMap, getDomainMapSnapshot } from "@/services/domain-maps";

// Transport exception: Observatory graph interactions use Route Handlers for incremental client updates.
export async function GET(request: NextRequest) {
  const domainSlug = request.nextUrl.searchParams.get("domain")?.trim() ?? "";
  const mapId = request.nextUrl.searchParams.get("map");
  const snapshot = await getDomainMapSnapshot(domainSlug, mapId);

  return NextResponse.json({ snapshot });
}

export async function POST(request: NextRequest) {
  const input = await request.json();
  const domainSlug =
    typeof input.domainSlug === "string" ? input.domainSlug.trim() : "";
  const result = await createDomainMap(domainSlug, input);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, details: result.error.details },
      { status: result.error.code === "not_found" ? 404 : 400 }
    );
  }

  return NextResponse.json({ snapshot: result.data }, { status: 201 });
}
