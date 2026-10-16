"use client";

import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DomainCrudDialog,
  type DomainCrudMode,
} from "@/components/shell/DomainCrudDialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DomainOverview } from "@/domain/domains";

type LandingDomainPanelProps = {
  domainOverviews: DomainOverview[];
};

const inventoryOrder = [
  "document",
  "subject",
  "claim",
  "relationship",
] as const;

export function LandingDomainPanel({
  domainOverviews,
}: LandingDomainPanelProps) {
  const router = useRouter();
  const [dialogMode, setDialogMode] = useState<DomainCrudMode | null>(
    domainOverviews.length === 0 ? "create" : null
  );
  const [selectedDomainSlug, setSelectedDomainSlug] = useState(
    domainOverviews[0]?.domain.slug ?? ""
  );

  const selectedOverview = useMemo(
    () =>
      domainOverviews.find(
        (overview) => overview.domain.slug === selectedDomainSlug
      ) ??
      domainOverviews[0] ??
      null,
    [domainOverviews, selectedDomainSlug]
  );
  const selectedDomain = selectedOverview?.domain ?? null;
  const workspaceHref = selectedDomain
    ? `/workshop?domain=${encodeURIComponent(selectedDomain.slug)}&class=document`
    : "/workshop";

  function closeDialog() {
    setDialogMode(null);
  }

  function handleDone(nextDomainSlug?: string) {
    closeDialog();

    if (dialogMode === "archive") {
      router.refresh();
      return;
    }

    if (nextDomainSlug) {
      setSelectedDomainSlug(nextDomainSlug);
      router.push(
        `/workshop?domain=${encodeURIComponent(nextDomainSlug)}&class=document`
      );
      return;
    }

    router.refresh();
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-t border-border bg-card/70 text-card-foreground shadow-[0_0_0_1px_color-mix(in_oklch,var(--border)_72%,transparent)] backdrop-blur md:border-t-0 md:border-l">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <h1 className="font-serif text-3xl font-medium leading-none tracking-normal">
            Memoria
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Shape source material into durable memory.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-6 py-7">
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] font-semibold uppercase text-primary">
              Domain
            </p>
            {domainOverviews.length > 0 ? (
              <div className="flex items-center gap-1">
                <Button
                  aria-label="Create domain"
                  onClick={() => setDialogMode("create")}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Plus />
                </Button>
                <Button
                  aria-label="Edit domain"
                  disabled={!selectedDomain}
                  onClick={() => setDialogMode("edit")}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Pencil />
                </Button>
                <Button
                  aria-label="Archive domain"
                  disabled={!selectedDomain}
                  onClick={() => setDialogMode("archive")}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 />
                </Button>
              </div>
            ) : null}
          </div>

          {domainOverviews.length > 0 ? (
            <>
              <Select
                value={selectedDomain?.slug ?? ""}
                onValueChange={setSelectedDomainSlug}
              >
                <SelectTrigger className="h-11 w-full bg-background/70">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {domainOverviews.map((overview) => (
                      <SelectItem
                        key={overview.domain.id}
                        value={overview.domain.slug}
                      >
                        {overview.domain.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <div className="grid grid-cols-2 gap-2">
                {inventoryOrder.map((key) => {
                  const item = selectedOverview?.inventory.find(
                    (entry) => entry.key === key
                  );

                  return (
                    <div
                      className="rounded-[var(--radius-sm)] border border-border bg-background/50 p-3"
                      key={key}
                    >
                      <p className="font-mono text-[10px] uppercase text-muted-foreground">
                        {item?.label ?? labelForInventoryKey(key)}
                      </p>
                      <p className="mt-2 text-2xl font-semibold">
                        {item?.count ?? 0}
                      </p>
                    </div>
                  );
                })}
              </div>

              <Button asChild className="w-full">
                <Link href={workspaceHref}>Open workspace</Link>
              </Button>
            </>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-border bg-background/50 p-4">
              <p className="text-sm font-medium text-foreground">
                Create a domain to begin.
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Domains give imports, claims, maps, and runs a working context.
              </p>
              <Button
                className="mt-4 w-full"
                onClick={() => setDialogMode("create")}
                type="button"
              >
                Create domain
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-5 border-t border-border pt-7">
          <p className="font-serif text-[1.08rem] leading-8 text-foreground">
            AI can refract any information into any shape. It cannot tell you
            which shape matters. That part is yours.
          </p>
          <LandingTextSection title="The premise">
            Understanding is not facts. It is the shape facts take when a mind
            decides what matters.
          </LandingTextSection>
          <LandingTextSection title="The work">
            Source material flows in. AI consolidates. You decide what is
            salient, name the clusters worth naming, and draw the relationships
            that carry meaning.
          </LandingTextSection>
        </section>
      </div>

      <DomainCrudDialog
        domainSlug={selectedDomain?.slug ?? ""}
        mode={dialogMode ?? "create"}
        onClose={closeDialog}
        onDone={handleDone}
        open={dialogMode !== null}
      />
    </aside>
  );
}

function LandingTextSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div>
      <p className="font-mono text-[11px] font-semibold uppercase text-primary">
        {title}
      </p>
      <p className="mt-2 font-serif text-[0.98rem] leading-7 text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

function labelForInventoryKey(key: (typeof inventoryOrder)[number]) {
  switch (key) {
    case "document":
      return "Documents";
    case "subject":
      return "Entities";
    case "claim":
      return "Claims";
    case "relationship":
      return "Relations";
  }
}
