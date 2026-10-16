import { redirectToWorkshop } from "@/app/(shell)/redirects";

type LabPageProps = {
  searchParams: Promise<{
    class?: string | string[];
    domain?: string | string[];
    sel?: string | string[];
    step?: string | string[];
  }>;
};

export default async function LabPage({ searchParams }: LabPageProps) {
  return redirectToWorkshop(searchParams, { class: "run" });
}
