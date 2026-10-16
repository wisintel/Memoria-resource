import { redirectToWorkshop } from "@/app/(shell)/redirects";

type LibraryPageProps = {
  searchParams: Promise<{
    class?: string | string[];
    domain?: string | string[];
    sel?: string | string[];
    step?: string | string[];
  }>;
};

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  return redirectToWorkshop(searchParams);
}
