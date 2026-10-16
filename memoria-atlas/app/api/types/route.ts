import { NextRequest, NextResponse } from "next/server";
import { getTypeFormOptions } from "@/services/types";

export async function GET(request: NextRequest) {
  const include = request.nextUrl.searchParams.get("include");

  if (include === "options") {
    const options = await getTypeFormOptions();

    return NextResponse.json({ options });
  }

  return NextResponse.json(
    { error: "Unsupported type request" },
    { status: 400 }
  );
}
