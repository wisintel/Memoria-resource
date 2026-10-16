import { NextRequest, NextResponse } from "next/server";
import { getPreparedDocument } from "@/services/documents";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// TODO(transport): Retained as a focused Inspector read endpoint until detail reads move to Server Components.
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const domainSlug = request.nextUrl.searchParams.get("domain") ?? undefined;
  const document = await getPreparedDocument(id, domainSlug);

  if (!document) {
    return NextResponse.json(
      { error: "Document was not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ document });
}
