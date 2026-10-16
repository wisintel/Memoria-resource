"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Domain } from "@/domain/domains";
import { domainCatalogChangedEvent } from "@/lib/shell/events";
import { cn } from "@/lib/utils";

export function DomainControl() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const domainSlug = searchParams.get("domain")?.trim() ?? "";
  const [domains, setDomains] = useState<Domain[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    loadActiveDomains(controller.signal)
      .then(setDomains)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error(error);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    let controller: AbortController | null = null;

    function refreshDomains() {
      controller?.abort();
      const refreshController = new AbortController();
      controller = refreshController;

      loadActiveDomains(refreshController.signal)
        .then((loadedDomains) => {
          setDomains(loadedDomains);

          if (loadedDomains.some((domain) => domain.slug === domainSlug)) {
            return;
          }

          const nextDomainSlug = loadedDomains[0]?.slug;

          if (!nextDomainSlug) {
            return;
          }

          const params = new URLSearchParams(searchParams.toString());
          params.set("domain", nextDomainSlug);
          params.delete("sel");
          params.delete("dialog");
          params.delete("mode");
          router.replace(`${pathname}?${params.toString()}`, {
            scroll: false,
          });
        })
        .catch((error: unknown) => {
          if (!refreshController.signal.aborted) {
            console.error(error);
          }
        });
    }

    window.addEventListener(domainCatalogChangedEvent, refreshDomains);

    return () => {
      controller?.abort();
      window.removeEventListener(domainCatalogChangedEvent, refreshDomains);
    };
  }, [domainSlug, pathname, router, searchParams]);

  useEffect(() => {
    if (domains.length === 0 || domainSlug) {
      return;
    }

    const nextDomainSlug = domains[0]?.slug;

    if (!nextDomainSlug) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("domain", nextDomainSlug);
    params.delete("sel");
    params.delete("dialog");
    params.delete("mode");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [domainSlug, domains, pathname, router, searchParams]);

  function selectDomain(nextDomainSlug: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("domain", nextDomainSlug);
    params.delete("sel");
    params.delete("dialog");
    params.delete("mode");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function openDomainCrud(mode: "archive" | "create" | "edit") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("dialog", "domain-crud");
    params.set("mode", mode);
    if (domainSlug) {
      params.set("domain", domainSlug);
    } else {
      params.delete("domain");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (domains.length === 0) {
    return (
      <ButtonGroup className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-input">
        <Button
          className="gap-2 rounded-none border-0 bg-transparent px-3 font-sans text-sm font-medium tracking-normal normal-case text-foreground hover:bg-muted"
          onClick={() => openDomainCrud("create")}
          type="button"
          variant="ghost"
        >
          <Plus data-icon="inline-start" />
          Create a domain
        </Button>
      </ButtonGroup>
    );
  }

  return (
    <ButtonGroup className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-input">
      <Select value={domainSlug} onValueChange={selectDomain}>
        <SelectTrigger
          className="min-w-36 border-0 bg-transparent font-sans text-sm font-medium tracking-normal normal-case text-foreground [&_[data-slot=select-value]]:font-sans [&_[data-slot=select-value]]:font-medium [&_[data-slot=select-value]]:tracking-normal [&_[data-slot=select-value]]:normal-case"
          aria-label="Select domain"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="font-sans">
          <SelectGroup>
            {domains.map((domain) => (
              <SelectItem
                key={domain.id}
                value={domain.slug}
                className="font-sans tracking-normal normal-case"
              >
                {domain.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <ButtonGroupSeparator className="bg-border" />
      <DomainIconButton
        label="Create domain"
        onClick={() => openDomainCrud("create")}
      >
        <Plus data-icon="inline-start" />
      </DomainIconButton>
      <ButtonGroupSeparator className="bg-border" />
      <DomainIconButton
        label="Edit domain"
        onClick={() => openDomainCrud("edit")}
        disabled={!domainSlug}
      >
        <Pencil data-icon="inline-start" />
      </DomainIconButton>
      <ButtonGroupSeparator className="bg-border" />
      <DomainIconButton
        label="Archive domain"
        onClick={() => openDomainCrud("archive")}
        disabled={!domainSlug}
        danger
      >
        <Trash2 data-icon="inline-start" />
      </DomainIconButton>
    </ButtonGroup>
  );
}

function DomainIconButton({
  children,
  danger,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "text-muted-foreground",
            danger
              ? "hover:bg-destructive/10 hover:text-destructive"
              : "hover:bg-muted hover:text-foreground"
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

async function loadActiveDomains(signal: AbortSignal) {
  const response = await fetch("/api/domains?status=active", { signal });
  const payload = (await response.json()) as {
    domains?: Domain[];
    error?: string;
  };

  if (!response.ok || !payload.domains) {
    throw new Error(payload.error ?? "Domains could not be loaded.");
  }

  return payload.domains;
}
