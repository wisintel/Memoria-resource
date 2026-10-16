import { NextRequest, NextResponse } from "next/server";
import { getSubjectDetail } from "@/services/subjects";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// TODO(transport): Retained as a focused Inspector read endpoint until detail reads move to Server Components.
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const domainSlug = request.nextUrl.searchParams.get("domain") ?? undefined;
  const subject = await getSubjectDetail(id, domainSlug);

  if (!subject) {
    return NextResponse.json(
      { error: "Subject was not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ subject });
}
