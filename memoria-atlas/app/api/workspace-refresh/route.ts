import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceRefreshSignal } from "@/services/workspace-refresh";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const domainSlug = request.nextUrl.searchParams.get("domain")?.trim() ?? "";

  if (!domainSlug) {
    return NextResponse.json(
      { error: "Domain is required" },
      { status: 400 }
    );
  }

  const signal = await getWorkspaceRefreshSignal(domainSlug);

  return NextResponse.json(signal, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
