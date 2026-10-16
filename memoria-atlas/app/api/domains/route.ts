import { NextRequest, NextResponse } from "next/server";
import {
  getDomainBySlug,
  getDomainOverviewBySlug,
  listDomains,
} from "@/services/domains";

// TODO(transport): Retained as a focused client read endpoint until domain reads move to Server Components.
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  const status = request.nextUrl.searchParams.get("status");
  const include = request.nextUrl.searchParams.get("include");

  if (slug) {
    if (include === "overview") {
      const overview = await getDomainOverviewBySlug(slug);

      if (!overview) {
        return NextResponse.json(
          { error: "Domain was not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ overview });
    }

    const domain = await getDomainBySlug(slug);

    if (!domain) {
      return NextResponse.json(
        { error: "Domain was not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ domain });
  }

  const domains = await listDomains(
    status === "active" || status === "archived" ? status : undefined
  );

  return NextResponse.json({ domains });
}
