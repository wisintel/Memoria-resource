import { NextRequest, NextResponse } from "next/server";

import { clearDomainMap } from "@/services/domain-maps";

// Transport exception: Observatory graph interactions use Route Handlers for incremental client updates.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const domainSlug = request.nextUrl.searchParams.get("domain")?.trim() ?? "";
  const result = await clearDomainMap(domainSlug, id);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, details: result.error.details },
      { status: result.error.code === "not_found" ? 404 : 400 }
    );
  }

  return NextResponse.json({ snapshot: result.data });
}
