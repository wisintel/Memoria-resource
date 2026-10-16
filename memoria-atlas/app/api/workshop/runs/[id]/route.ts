import { NextRequest, NextResponse } from "next/server";
import { getLabRunDetail } from "@/services/lab-runs";

type RunRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RunRouteContext) {
  const { id } = await context.params;
  const domainSlug = request.nextUrl.searchParams.get("domain")?.trim() ?? "";
  const run = await getLabRunDetail(domainSlug, id);

  if (!run) {
    return NextResponse.json({ error: "Run was not found" }, { status: 404 });
  }

  return NextResponse.json({ run });
}
