import { redirect } from "next/navigation";

type ShellSearchParams = Record<string, string | string[] | undefined>;

export async function redirectToWorkshop(
  searchParams: Promise<ShellSearchParams>,
  defaults: Partial<Record<string, string>> = {}
): Promise<never> {
  const params = await searchParams;
  const nextParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        nextParams.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      nextParams.set(key, value);
    }
  }

  for (const [key, value] of Object.entries(defaults)) {
    if (!nextParams.has(key) && value !== undefined) {
      nextParams.set(key, value);
    }
  }

  const query = nextParams.toString();

  redirect(query ? `/workshop?${query}` : "/workshop");
}
