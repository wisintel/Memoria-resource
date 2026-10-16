import { NextRequest, NextResponse } from "next/server";
import { getClaimDetail } from "@/services/claims";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// TODO(transport): Retained as a focused Inspector read endpoint until detail reads move to Server Components.
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const domainSlug = request.nextUrl.searchParams.get("domain") ?? undefined;
  const claim = await getClaimDetail(id, domainSlug);

  if (!claim) {
    return NextResponse.json(
      { error: "Claim was not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ claim });
}
