import { redirectToWorkshop } from "@/app/(shell)/redirects";

type ObservatoryPageProps = {
  searchParams: Promise<{
    domain?: string | string[];
  }>;
};

export default async function ObservatoryPage({
  searchParams,
}: ObservatoryPageProps) {
  return redirectToWorkshop(searchParams, { class: "subject" });
}
