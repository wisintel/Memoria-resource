import { NextRequest, NextResponse } from "next/server";
import { getClaimFormOptions } from "@/services/claims";

// TODO(transport): Retained as a focused client read endpoint until form-option reads move to Server Components.
export async function GET(request: NextRequest) {
  const domainSlug = request.nextUrl.searchParams.get("domain")?.trim() ?? "";
  const include = request.nextUrl.searchParams.get("include");

  if (include === "options") {
    const options = await getClaimFormOptions(domainSlug);

    return NextResponse.json({ options });
  }

  return NextResponse.json(
    { error: "Unsupported claim request" },
    { status: 400 }
  );
}
