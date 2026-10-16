"use client";

import { CircleDashed, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PreparedDocument } from "@/domain/documents";
import type { DomainMapSnapshot } from "@/domain/domain-maps";
import type { LabRunDetail, LabRunStartOptions } from "@/domain/runs";
import type { ShelfClassKey } from "@/domain/shelf";
import type { WorkshopSubjectPackage } from "@/domain/workshop";
import { DocumentReader } from "@/features/workshop/DocumentReader";
import { DomainMapGraphStage } from "@/features/workshop/DomainMapGraphStage";
import { RunPanel } from "@/features/workshop/RunPanel";
import { WorkshopClaimWorkspace } from "@/features/workshop/WorkshopClaimWorkspace";

type DomainMapApiPayload = {
  error?: string;
  snapshot?: DomainMapSnapshot;
};

type DomainMapDialogValue = {
  description: string;
  label: string;
};

type InspectableGraphClassKey = Extract<
  ShelfClassKey,
  "domain_map" | "relationship" | "subject"
>;

type GraphWorkspaceProps = {
  admissionPackages: WorkshopSubjectPackage[];
  preparedDocument: PreparedDocument | null;
  selectedClass: string | null;
  selectedDocumentId: string | null;
  selectedRun: LabRunDetail | null;
  selectedRunId: string | null;
  selectedStepId: string | null;
  startOptions: LabRunStartOptions | null;
};

type BottomTrayMode = "run" | "claim";

export function GraphWorkspace({
  admissionPackages,
  preparedDocument,
  selectedClass,
  selectedDocumentId,
  selectedRun,
  selectedRunId,
  selectedStepId,
  startOptions,
}: GraphWorkspaceProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const domainSlug = searchParams.get("domain")?.trim() ?? "";
  const mapId = searchParams.get("map");
  const selectedPackage = searchParams.get("pkg");
  const selectedClaimId = searchParams.get("claim");
  const [snapshot, setSnapshot] = useState<DomainMapSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [claimWorkspaceOpen, setClaimWorkspaceOpen] = useState(true);
  const [bottomTrayMode, setBottomTrayMode] = useState<BottomTrayMode>(
    selectedClass === "run" ? "run" : "claim"
  );
  const [renameOpen, setRenameOpen] = useState(false);
  const activeMap = snapshot?.activeMap ?? null;
  const isLoading = !snapshot && !loadError;

  const replaceMapParam = useCallback(
    (nextMapId: string | null, inspectMap = false) => {
      const params = new URLSearchParams(searchParams.toString());
      if (domainSlug) {
        params.set("domain", domainSlug);
      } else {
        params.delete("domain");
      }

      if (nextMapId) {
        params.set("map", nextMapId);
        if (inspectMap) {
          params.set("class", "domain_map");
          params.set("sel", nextMapId);
        }
      } else {
        params.delete("map");
        if (params.get("class") === "domain_map") {
          params.delete("class");
          params.delete("sel");
        }
      }

      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [domainSlug, pathname, router, searchParams]
  );

  useEffect(() => {
    if (!domainSlug) {
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ domain: domainSlug });

    if (mapId) {
      params.set("map", mapId);
    }

    fetch(`/api/domain-maps?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(readDomainMapPayload)
      .then((payload) => {
        if (!payload.snapshot) {
          throw new Error("Domain Maps could not be loaded.");
        }

        setSnapshot(payload.snapshot);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setSnapshot(null);
        setLoadError(
          error instanceof Error
            ? error.message
            : "Domain Maps could not be loaded."
        );
      });

    return () => controller.abort();
  }, [domainSlug, mapId, refreshNonce]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const nextMapId = snapshot.activeMap?.id ?? null;

    if (mapId && snapshot.maps.some((map) => map.id === mapId)) {
      return;
    }

    if ((mapId ?? null) !== nextMapId) {
      replaceMapParam(nextMapId, searchParams.get("class") === "domain_map");
    }
  }, [mapId, replaceMapParam, searchParams, snapshot]);

  const maps = snapshot?.maps ?? [];
  const activeAdmissionPackage =
    admissionPackages.find(
      (pkg) => pkg.normalizedSubject === selectedPackage
    ) ??
    admissionPackages[0] ??
    null;

  useEffect(() => {
    if (selectedClass === "run") {
      setBottomTrayMode("run");
      setClaimWorkspaceOpen(true);
    } else if (selectedClass === "claim") {
      setBottomTrayMode("claim");
      setClaimWorkspaceOpen(true);
    }
  }, [selectedClass]);

  async function runMutation(
    request: Promise<Response>,
    afterSuccess?: (snapshot: DomainMapSnapshot) => void
  ) {
    setMutationError(null);
    setIsMutating(true);

    try {
      const payload = await readDomainMapPayload(await request);

      if (!payload.snapshot) {
        throw new Error("Domain Map was not updated.");
      }

      setSnapshot(payload.snapshot);
      afterSuccess?.(payload.snapshot);
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "Domain Map was not updated."
      );
    } finally {
      setIsMutating(false);
    }
  }

  function handleMapChange(nextMapId: string) {
    replaceMapParam(nextMapId, true);
  }

  function closeDocumentOverlay() {
    const params = new URLSearchParams(searchParams.toString());

    params.delete("sel");
    if (params.get("class") === "document") {
      params.set("class", "subject");
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleInspectRecord(selection: {
    classKey: InspectableGraphClassKey;
    id: string;
  }) {
    if (!domainSlug) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("domain", domainSlug);
    params.set("class", selection.classKey);
    params.set("sel", selection.id);

    if (activeMap) {
      params.set("map", activeMap.id);
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function handleCreate(value: DomainMapDialogValue) {
    if (!domainSlug) {
      setMutationError("Select a domain before creating a map.");
      return;
    }

    await runMutation(
      fetch("/api/domain-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainSlug, ...value }),
      }),
      (nextSnapshot) => {
        setCreateOpen(false);
        if (nextSnapshot.activeMap) {
          replaceMapParam(nextSnapshot.activeMap.id, true);
        }
      }
    );
  }

  async function handleRename(value: DomainMapDialogValue) {
    if (!activeMap) {
      return;
    }

    if (!domainSlug) {
      setMutationError("Select a domain before renaming a map.");
      return;
    }

    await runMutation(
      fetch(`/api/domain-maps/${activeMap.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainSlug, ...value }),
      }),
      () => setRenameOpen(false)
    );
  }

  async function handleArchive() {
    if (!activeMap || !window.confirm("Archive this Domain Map?")) {
      return;
    }

    if (!domainSlug) {
      setMutationError("Select a domain before archiving a map.");
      return;
    }

    await runMutation(
      fetch(`/api/domain-maps/${activeMap.id}?domain=${domainSlug}`, {
        method: "DELETE",
      })
    );
  }

  async function handleClear() {
    if (!activeMap || !window.confirm("Clear this workspace?")) {
      return;
    }

    if (!domainSlug) {
      setMutationError("Select a domain before clearing a map.");
      return;
    }

    await runMutation(
      fetch(`/api/domain-maps/${activeMap.id}/contents?domain=${domainSlug}`, {
        method: "DELETE",
      })
    );
  }

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <main className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        {loadError ? (
          <StageEmpty title={loadError} />
        ) : activeMap && snapshot ? (
          <>
            {mutationError ? (
              <div className="rounded-[var(--radius)] border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {mutationError}
              </div>
            ) : null}

            <div className="min-h-0 flex-1">
              <DomainMapGraphStage
                key={activeMap.id}
                activeMapId={activeMap.id}
                domainSlug={domainSlug}
                isLoading={isLoading}
                isMutating={isMutating}
                maps={maps}
                onArchiveMap={handleArchive}
                onClearMap={handleClear}
                onCreateMap={() => setCreateOpen(true)}
                onEditMap={() => setRenameOpen(true)}
                snapshot={snapshot}
                onError={setMutationError}
                onInspectActiveMap={() =>
                  activeMap ? replaceMapParam(activeMap.id, true) : undefined
                }
                onInspectRecord={handleInspectRecord}
                onMapChange={handleMapChange}
                onRefresh={() => setRefreshNonce((current) => current + 1)}
                onSnapshot={setSnapshot}
              />
            </div>

            <div
              className={`relative shrink-0 overflow-hidden rounded-[var(--radius)] border border-border bg-card/50 transition-[height] duration-200 ease-out ${
                claimWorkspaceOpen ? "h-1/2" : "h-11"
              }`}
            >
              <div className="relative flex h-11 items-center justify-between border-b border-border px-3">
                <button
                  aria-pressed={bottomTrayMode === "run"}
                  className={`inline-flex h-full w-fit items-center px-2 font-mono text-[11px] font-semibold tracking-[0.16em] uppercase transition-colors ${
                    bottomTrayMode === "run"
                      ? "bg-primary/10 text-primary shadow-[inset_0_-2px_0_var(--primary)]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setBottomTrayMode("run");
                    setClaimWorkspaceOpen(true);
                  }}
                  type="button"
                >
                  Run Control
                </button>
                <button
                  aria-label={
                    claimWorkspaceOpen ? "Collapse tray" : "Open tray"
                  }
                  className={`absolute left-1/2 top-1/2 z-10 h-5 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/50 bg-primary/15 shadow-[0_0_18px_color-mix(in_oklab,var(--primary)_42%,transparent)] transition hover:bg-primary/25 ${
                    claimWorkspaceOpen ? "opacity-100" : "opacity-80"
                  }`}
                  onClick={() => setClaimWorkspaceOpen((open) => !open)}
                  type="button"
                >
                  <span className="mx-auto block h-1 w-14 rounded-full bg-primary/75" />
                </button>
                <button
                  aria-pressed={bottomTrayMode === "claim"}
                  className={`inline-flex h-full w-fit items-center px-2 text-right font-mono text-[11px] font-semibold tracking-[0.16em] uppercase transition-colors ${
                    bottomTrayMode === "claim"
                      ? "bg-primary/10 text-primary shadow-[inset_0_-2px_0_var(--primary)]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setBottomTrayMode("claim");
                    setClaimWorkspaceOpen(true);
                  }}
                  type="button"
                >
                  Claim Workspace
                </button>
              </div>
              {claimWorkspaceOpen ? (
                <div className="h-[calc(100%-2.75rem)] min-h-0">
                  {bottomTrayMode === "run" ? (
                    startOptions ? (
                      <RunPanel
                        key={`${domainSlug}:${selectedRun?.id ?? selectedRunId ?? "new-run"}`}
                        domainSlug={domainSlug}
                        selectedRun={selectedRun}
                        selectedRunId={selectedRunId}
                        selectedStepId={selectedStepId}
                        showHeader={false}
                        startOptions={startOptions}
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-sm text-muted-foreground">
                        Run control unavailable
                      </div>
                    )
                  ) : (
                    <WorkshopClaimWorkspace
                      packages={admissionPackages}
                      selectedClaimId={selectedClaimId}
                      selectedPackage={activeAdmissionPackage}
                      showHeader={false}
                    />
                  )}
                </div>
              ) : null}
            </div>
          </>
        ) : isLoading ? (
          <StageEmpty title="Loading Domain Maps" />
        ) : (
          <StageEmpty title="Preparing Workspace" />
        )}
      </main>

      {selectedDocumentId ? (
        <div className="absolute inset-4 z-30 flex min-h-0 flex-col rounded-[var(--radius-lg)] border border-border bg-background/95 p-3 shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
                Document Reader
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {preparedDocument?.document.label ?? "Selected document"}
              </p>
            </div>
            <Button
              aria-label="Close document reader"
              onClick={closeDocumentOverlay}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <X />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1">
            <DocumentReader
              prepared={preparedDocument}
              selectedId={selectedDocumentId}
            />
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <DomainMapDialog
          open={createOpen}
          title="New Domain Map"
          submitLabel="Create"
          isSubmitting={isMutating}
          onOpenChange={setCreateOpen}
          onSubmit={handleCreate}
        />
      ) : null}
      {renameOpen ? (
        <DomainMapDialog
          open={renameOpen}
          title={activeMap?.isWip ? "Save Domain Map" : "Edit Domain Map"}
          submitLabel="Save"
          initialDescription={activeMap?.description ?? ""}
          initialLabel={activeMap?.label ?? ""}
          isSubmitting={isMutating}
          onOpenChange={setRenameOpen}
          onSubmit={handleRename}
        />
      ) : null}
    </section>
  );
}

async function readDomainMapPayload(response: Response) {
  const payload = (await response.json()) as DomainMapApiPayload;

  if (!response.ok) {
    throw new Error(payload.error ?? "Domain Map request failed.");
  }

  return payload;
}

function StageEmpty({ title }: { title: string }) {
  return (
    <div className="grid min-h-48 flex-1 place-items-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CircleDashed className="size-4" />
        {title}
      </div>
    </div>
  );
}

function DomainMapDialog({
  initialDescription = "",
  initialLabel = "",
  isSubmitting,
  onOpenChange,
  onSubmit,
  open,
  submitLabel,
  title,
}: {
  initialDescription?: string;
  initialLabel?: string;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: DomainMapDialogValue) => Promise<void>;
  open: boolean;
  submitLabel: string;
  title: string;
}) {
  const [description, setDescription] = useState(initialDescription);
  const [label, setLabel] = useState(initialLabel);
  const normalizedLabel = label.trim();
  const normalizedDescription = description.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (normalizedLabel.length < 2) {
      return;
    }

    await onSubmit({
      description: normalizedDescription,
      label: normalizedLabel,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="domain-map-label">Name</Label>
            <Input
              id="domain-map-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="domain-map-intent">Intent</Label>
            <Textarea
              id="domain-map-intent"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || normalizedLabel.length < 2}
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
