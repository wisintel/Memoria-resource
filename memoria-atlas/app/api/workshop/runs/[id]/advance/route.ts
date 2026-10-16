import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { advanceExtractionRun } from "@/services/extraction";

type AdvanceRunRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  request: NextRequest,
  context: AdvanceRunRouteContext
) {
  const { id } = await context.params;
  const input = (await request.json().catch(() => ({}))) as {
    domainSlug?: unknown;
  };
  const domainSlug =
    typeof input.domainSlug === "string"
      ? input.domainSlug.trim()
      : (request.nextUrl.searchParams.get("domain")?.trim() ?? "");
  const result = await advanceExtractionRun(domainSlug, id);

  revalidatePath("/workshop");

  if (!result.ok) {
    return NextResponse.json(
      {
        code: result.error.code,
        details: result.error.details,
        error: result.error.message,
      },
      { status: result.error.code === "not_found" ? 404 : 400 }
    );
  }

  return NextResponse.json({ advance: result.data });
}
