"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

type WorkspaceRefreshSignal = {
  domainSlug: string;
  version: string;
};

const pollIntervalMs = 1750;

export function WorkspaceRefreshWatcher() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const domainSlug = searchParams.get("domain")?.trim() ?? "";
  const lastVersionRef = useRef<string | null>(null);

  useEffect(() => {
    lastVersionRef.current = null;

    if (!domainSlug) {
      return;
    }

    let stopped = false;
    let timeoutId: number | null = null;

    async function poll() {
      const controller = new AbortController();

      try {
        const response = await fetch(
          `/api/workspace-refresh?${new URLSearchParams({
            domain: domainSlug,
          }).toString()}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (response.ok) {
          const signal = (await response.json()) as WorkspaceRefreshSignal;
          const previousVersion = lastVersionRef.current;

          lastVersionRef.current = signal.version;

          if (
            previousVersion !== null &&
            signal.version &&
            signal.version !== previousVersion
          ) {
            window.dispatchEvent(new Event("memoria:shelf-refresh"));
            router.refresh();
          }
        }
      } catch {
      } finally {
        if (!stopped) {
          timeoutId = window.setTimeout(poll, pollIntervalMs);
        }
      }
    }

    void poll();

    return () => {
      stopped = true;

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [domainSlug, router]);

  return null;
}
