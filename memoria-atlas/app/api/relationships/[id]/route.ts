import { NextRequest, NextResponse } from "next/server";
import { getRelationshipDetail } from "@/services/relationships";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// TODO(transport): Retained as a focused Inspector read endpoint until detail reads move to Server Components.
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const domainSlug = request.nextUrl.searchParams.get("domain") ?? undefined;
  const relationship = await getRelationshipDetail(id, domainSlug);

  if (!relationship) {
    return NextResponse.json(
      { error: "Relationship was not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ relationship });
}
