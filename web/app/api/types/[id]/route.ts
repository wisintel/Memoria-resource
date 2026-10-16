import { NextRequest, NextResponse } from "next/server";
import { getTypeDetail } from "@/services/types";

type TypeRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: TypeRouteContext) {
  const domainSlug = request.nextUrl.searchParams.get("domain")?.trim() ?? "";
  const { id } = await context.params;
  const type = await getTypeDetail(id, domainSlug);

  if (!type) {
    return NextResponse.json(
      { error: "Type was not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ type });
}
