import { NextRequest, NextResponse } from "next/server";

import { addRelationshipToDomainMap } from "@/services/domain-maps";

// Transport exception: Observatory graph interactions use Route Handlers for incremental client updates.
type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const input = await request.json();
  const domainSlug =
    typeof input.domainSlug === "string" ? input.domainSlug.trim() : "";
  const result = await addRelationshipToDomainMap(domainSlug, id, input);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, details: result.error.details },
      { status: result.error.code === "not_found" ? 404 : 400 }
    );
  }

  return NextResponse.json({ snapshot: result.data }, { status: 201 });
}
