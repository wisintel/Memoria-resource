import { NextRequest, NextResponse } from "next/server";

import { removeRelationshipFromDomainMap } from "@/services/domain-maps";

// Transport exception: Observatory graph interactions use Route Handlers for incremental client updates.
type RouteContext = {
  params: Promise<{ id: string; mapRelationshipId: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id, mapRelationshipId } = await context.params;
  const domainSlug = request.nextUrl.searchParams.get("domain")?.trim() ?? "";
  const result = await removeRelationshipFromDomainMap(
    domainSlug,
    id,
    mapRelationshipId
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, details: result.error.details },
      { status: result.error.code === "not_found" ? 404 : 400 }
    );
  }

  return NextResponse.json({ snapshot: result.data });
}
