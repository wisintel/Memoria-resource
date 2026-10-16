"use client";

import Link from "next/link";
import { ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createLexicalizationShellAction,
  deleteLexicalizationShellAction,
  deleteShelfItemShellAction,
  updateClaimShellAction,
  updateLexicalizationShellAction,
} from "@/app/(shell)/actions";
import { DomainControl } from "@/components/shell/DomainControl";
import {
  RecordCrudDialog,
  type RecordCrudMode,
} from "@/components/shell/RecordCrudDialog";
import type { ClaimDetail, ClaimFormOptions } from "@/domain/claims";
import type { PreparedDocument, SourceUnitRecord } from "@/domain/documents";
import type { DomainMapSnapshot } from "@/domain/domain-maps";
import type { DomainOverview } from "@/domain/domains";
import type { LabRunDetail, LabRunStepView } from "@/domain/lab-runs";
import type { RelationshipDetail } from "@/domain/relationships";
import type { ShelfClassKey } from "@/domain/shelf";
import type {
  SubjectAliasRelatedItem,
  SubjectClaimRelatedItem,
  SubjectDetail,
  SubjectRelationshipRelatedItem,
} from "@/domain/subjects";
import type { TypeDetail } from "@/domain/types";
import { cn } from "@/lib/utils";

type DomainOverviewState = {
  domainSlug: string;
  error: string | null;
  isLoading: boolean;
  overview: DomainOverview | null;
};

type SubjectDetailState = {
  domainSlug: string;
  error: string | null;
  isLoading: boolean;
  selectedId: string;
  subject: SubjectDetail | null;
};

type ClaimDetailState = {
  claim: ClaimDetail | null;
  domainSlug: string;
  error: string | null;
  isLoading: boolean;
  selectedId: string;
};

type RelationshipDetailState = {
  domainSlug: string;
  error: string | null;
  isLoading: boolean;
  relationship: RelationshipDetail | null;
  selectedId: string;
};

type TypeDetailState = {
  domainSlug: string;
  error: string | null;
  isLoading: boolean;
  selectedId: string;
  type: TypeDetail | null;
};

type DomainMapDetailState = {
  domainSlug: string;
  error: string | null;
  isLoading: boolean;
  selectedId: string;
  snapshot: DomainMapSnapshot | null;
};

type DocumentDetailState = {
  document: PreparedDocument | null;
  domainSlug: string;
  error: string | null;
  isLoading: boolean;
  selectedId: string;
};

type RunDetailState = {
  domainSlug: string;
  error: string | null;
  isLoading: boolean;
  run: LabRunDetail | null;
  selectedId: string;
};

type RelatedCrudDialog =
  | {
      kind: "alias";
      alias: SubjectAliasRelatedItem | null;
      mode: RecordCrudMode;
    }
  | {
      kind: "claim";
      mode: RecordCrudMode;
      selectedId: string | null;
    }
  | {
      kind: "relationship";
      mode: RecordCrudMode;
      selectedId: string | null;
    };

type AliasFormValue = {
  language: string;
  lexicalType: string;
  value: string;
};

type RelatedTab = "claims" | "aliases" | "relationships";
export function Inspector() {
  const searchParams = useSearchParams();
  const domainSlug = searchParams.get("domain")?.trim() ?? "";
  const classKey =
    searchParams.get("inspectorClass") ?? searchParams.get("class");
  const selectedId =
    searchParams.get("inspectorSel") ?? searchParams.get("sel");
  const stepId = searchParams.get("step");

  return (
    <Sidebar side="right" collapsible="none" className="h-full min-h-0 w-full">
      <SidebarContent className="flex min-h-0 flex-col p-4">
        <div className="min-h-0 flex-1 overflow-hidden">
          {classKey === "subject" && selectedId ? (
            <SubjectInspector domainSlug={domainSlug} selectedId={selectedId} />
          ) : classKey === "bundle" && selectedId ? (
            <BundleInspector selectedId={selectedId} />
          ) : classKey === "run" && selectedId ? (
            <RunInspector
              domainSlug={domainSlug}
              selectedId={selectedId}
              stepId={stepId}
            />
          ) : classKey === "document" && selectedId ? (
            <DocumentInspector
              domainSlug={domainSlug}
              selectedId={selectedId}
            />
          ) : classKey === "claim" && selectedId ? (
            <ClaimInspector domainSlug={domainSlug} selectedId={selectedId} />
          ) : classKey === "relationship" && selectedId ? (
            <RelationshipInspector
              domainSlug={domainSlug}
              selectedId={selectedId}
            />
          ) : classKey === "type" && selectedId ? (
            <TypeInspector domainSlug={domainSlug} selectedId={selectedId} />
          ) : classKey === "domain_map" && selectedId ? (
            <DomainMapInspector
              domainSlug={domainSlug}
              selectedId={selectedId}
            />
          ) : (
            <DomainInspector domainSlug={domainSlug} />
          )}
        </div>
        <div className="mt-4 border-t border-border pt-4">
          {/* TODO: Permanent domain control placement TBD after dock removal. */}
          <DomainControl />
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

function DocumentInspector({
  domainSlug,
  selectedId,
}: {
  domainSlug: string;
  selectedId: string;
}) {
  const [state, setState] = useState<DocumentDetailState>({
    document: null,
    domainSlug,
    error: null,
    isLoading: true,
    selectedId,
  });

  useEffect(() => {
    const controller = new AbortController();

    fetch(
      `/api/documents/${selectedId}?domain=${encodeURIComponent(domainSlug)}`,
      {
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          document?: PreparedDocument;
          error?: string;
        };

        if (!response.ok || !payload.document) {
          throw new Error(payload.error ?? "Document could not be loaded.");
        }

        return payload.document;
      })
      .then((document) => {
        setState({
          document,
          domainSlug,
          error: null,
          isLoading: false,
          selectedId,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          document: null,
          domainSlug,
          error:
            error instanceof Error
              ? error.message
              : "Document could not be loaded.",
          isLoading: false,
          selectedId,
        });
      });

    return () => controller.abort();
  }, [domainSlug, selectedId]);

  const matchesCurrentRequest =
    state.domainSlug === domainSlug && state.selectedId === selectedId;
  const isLoading = state.isLoading || !matchesCurrentRequest;
  const document = matchesCurrentRequest ? state.document : null;
  const error = matchesCurrentRequest ? state.error : null;

  if (isLoading) {
    return <DocumentInspectorSkeleton />;
  }

  if (document) {
    return <DocumentInspectorCard prepared={document} />;
  }

  return (
    <InspectorError
      title="Document unavailable"
      message={error ?? "Document could not be loaded."}
    />
  );
}

function RunInspector({
  domainSlug,
  selectedId,
  stepId,
}: {
  domainSlug: string;
  selectedId: string;
  stepId: string | null;
}) {
  const [state, setState] = useState<RunDetailState>({
    domainSlug,
    error: null,
    isLoading: true,
    run: null,
    selectedId,
  });

  useEffect(() => {
    let controller: AbortController | null = null;

    function loadRun() {
      controller?.abort();
      controller = new AbortController();

      fetch(
        `/api/workshop/runs/${selectedId}?domain=${encodeURIComponent(domainSlug)}`,
        { signal: controller.signal }
      )
        .then(async (response) => {
          const payload = (await response.json()) as {
            error?: string;
            run?: LabRunDetail;
          };

          if (!response.ok || !payload.run) {
            throw new Error(payload.error ?? "Run could not be loaded.");
          }

          return payload.run;
        })
        .then((run) => {
          setState({
            domainSlug,
            error: null,
            isLoading: false,
            run,
            selectedId,
          });
        })
        .catch((error: unknown) => {
          if (controller?.signal.aborted) {
            return;
          }

          setState({
            domainSlug,
            error:
              error instanceof Error
                ? error.message
                : "Run could not be loaded.",
            isLoading: false,
            run: null,
            selectedId,
          });
        });
    }

    loadRun();
    window.addEventListener("memoria:shelf-refresh", loadRun);

    return () => {
      controller?.abort();
      window.removeEventListener("memoria:shelf-refresh", loadRun);
    };
  }, [domainSlug, selectedId]);

  const matchesCurrentRequest =
    state.domainSlug === domainSlug && state.selectedId === selectedId;
  const isLoading = state.isLoading || !matchesCurrentRequest;
  const run = matchesCurrentRequest ? state.run : null;
  const error = matchesCurrentRequest ? state.error : null;

  if (isLoading) {
    return <RunInspectorSkeleton />;
  }

  if (run) {
    const selectedStep = stepId
      ? (run.steps.find((step) => step.id === stepId) ?? null)
      : null;

    return <RunInspectorCard run={run} selectedStep={selectedStep} />;
  }

  return (
    <InspectorError
      title="Run unavailable"
      message={error ?? "Run could not be loaded."}
    />
  );
}

function BundleInspector({ selectedId }: { selectedId: string }) {
  return (
    <InspectorError
      title="Nothing to review yet"
      message={`Extraction bundle ${selectedId} is parked until the review flow is rebuilt.`}
    />
  );
}

function DomainMapInspector({
  domainSlug,
  selectedId,
}: {
  domainSlug: string;
  selectedId: string;
}) {
  const [state, setState] = useState<DomainMapDetailState>({
    domainSlug,
    error: null,
    isLoading: true,
    selectedId,
    snapshot: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ domain: domainSlug, map: selectedId });

    fetch(`/api/domain-maps?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          snapshot?: DomainMapSnapshot;
        };

        if (!response.ok || !payload.snapshot) {
          throw new Error(payload.error ?? "Domain Map could not be loaded.");
        }

        if (payload.snapshot.activeMap?.id !== selectedId) {
          throw new Error("Domain Map could not be found in this domain.");
        }

        return payload.snapshot;
      })
      .then((snapshot) => {
        setState({
          domainSlug,
          error: null,
          isLoading: false,
          selectedId,
          snapshot,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          domainSlug,
          error:
            error instanceof Error
              ? error.message
              : "Domain Map could not be loaded.",
          isLoading: false,
          selectedId,
          snapshot: null,
        });
      });

    return () => controller.abort();
  }, [domainSlug, selectedId]);

  const matchesCurrentRequest =
    state.domainSlug === domainSlug && state.selectedId === selectedId;
  const isLoading = state.isLoading || !matchesCurrentRequest;
  const snapshot = matchesCurrentRequest ? state.snapshot : null;
  const error = matchesCurrentRequest ? state.error : null;

  if (isLoading) {
    return <DomainMapInspectorSkeleton />;
  }

  if (snapshot?.activeMap) {
    return <DomainMapInspectorCard snapshot={snapshot} />;
  }

  return (
    <InspectorError
      title="Domain Map unavailable"
      message={error ?? "Domain Map could not be loaded."}
    />
  );
}

function DomainInspector({ domainSlug }: { domainSlug: string }) {
  const [state, setState] = useState<DomainOverviewState>({
    domainSlug,
    error: null,
    isLoading: true,
    overview: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    fetch(
      `/api/domains?slug=${encodeURIComponent(domainSlug)}&include=overview`,
      {
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          overview?: DomainOverview;
        };

        if (!response.ok || !payload.overview) {
          throw new Error(
            payload.error ?? "Domain overview could not be loaded."
          );
        }

        return payload.overview;
      })
      .then((overview) => {
        setState({
          domainSlug,
          error: null,
          isLoading: false,
          overview,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          domainSlug,
          error:
            error instanceof Error
              ? error.message
              : "Domain overview could not be loaded.",
          isLoading: false,
          overview: null,
        });
      });

    return () => controller.abort();
  }, [domainSlug]);
  const isLoading = state.isLoading || state.domainSlug !== domainSlug;
  const overview = state.domainSlug === domainSlug ? state.overview : null;
  const error = state.domainSlug === domainSlug ? state.error : null;

  if (isLoading) {
    return <DomainOverviewSkeleton />;
  }

  if (overview) {
    return <DomainOverviewCard overview={overview} />;
  }

  return (
    <InspectorError
      title="Domain unavailable"
      message={error ?? "Domain overview could not be loaded."}
    />
  );
}

function SubjectInspector({
  domainSlug,
  selectedId,
}: {
  domainSlug: string;
  selectedId: string;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<SubjectDetailState>({
    domainSlug,
    error: null,
    isLoading: true,
    selectedId,
    subject: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    fetch(
      `/api/subjects/${selectedId}?domain=${encodeURIComponent(domainSlug)}`,
      {
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          subject?: SubjectDetail;
        };

        if (!response.ok || !payload.subject) {
          throw new Error(payload.error ?? "Subject could not be loaded.");
        }

        return payload.subject;
      })
      .then((subject) => {
        setState({
          domainSlug,
          error: null,
          isLoading: false,
          selectedId,
          subject,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          domainSlug,
          error:
            error instanceof Error
              ? error.message
              : "Subject could not be loaded.",
          isLoading: false,
          selectedId,
          subject: null,
        });
      });

    return () => controller.abort();
  }, [domainSlug, refreshKey, selectedId]);

  const matchesCurrentRequest =
    state.domainSlug === domainSlug && state.selectedId === selectedId;
  const isLoading = state.isLoading || !matchesCurrentRequest;
  const subject = matchesCurrentRequest ? state.subject : null;
  const error = matchesCurrentRequest ? state.error : null;

  if (isLoading) {
    return <SubjectInspectorSkeleton />;
  }

  if (subject) {
    return (
      <SubjectInspectorCard
        domainSlug={domainSlug}
        onRelatedChange={() => setRefreshKey((current) => current + 1)}
        subject={subject}
      />
    );
  }

  return (
    <InspectorError
      title="Subject unavailable"
      message={error ?? "Subject could not be loaded."}
    />
  );
}

function ClaimInspector({
  domainSlug,
  selectedId,
}: {
  domainSlug: string;
  selectedId: string;
}) {
  const [state, setState] = useState<ClaimDetailState>({
    claim: null,
    domainSlug,
    error: null,
    isLoading: true,
    selectedId,
  });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetch(
      `/api/claims/${selectedId}?domain=${encodeURIComponent(domainSlug)}`,
      {
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          claim?: ClaimDetail;
          error?: string;
        };

        if (!response.ok || !payload.claim) {
          throw new Error(payload.error ?? "Claim could not be loaded.");
        }

        return payload.claim;
      })
      .then((claim) => {
        setState({
          claim,
          domainSlug,
          error: null,
          isLoading: false,
          selectedId,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          claim: null,
          domainSlug,
          error:
            error instanceof Error
              ? error.message
              : "Claim could not be loaded.",
          isLoading: false,
          selectedId,
        });
      });

    return () => controller.abort();
  }, [domainSlug, refreshKey, selectedId]);

  const matchesCurrentRequest =
    state.domainSlug === domainSlug && state.selectedId === selectedId;
  const isLoading = state.isLoading || !matchesCurrentRequest;
  const claim = matchesCurrentRequest ? state.claim : null;
  const error = matchesCurrentRequest ? state.error : null;

  if (isLoading) {
    return <ClaimInspectorSkeleton />;
  }

  if (claim) {
    return (
      <ClaimInspectorCard
        claim={claim}
        domainSlug={domainSlug}
        onRelatedChange={() => setRefreshKey((current) => current + 1)}
      />
    );
  }

  return (
    <InspectorError
      title="Claim unavailable"
      message={error ?? "Claim could not be loaded."}
    />
  );
}

function RelationshipInspector({
  domainSlug,
  selectedId,
}: {
  domainSlug: string;
  selectedId: string;
}) {
  const [state, setState] = useState<RelationshipDetailState>({
    domainSlug,
    error: null,
    isLoading: true,
    relationship: null,
    selectedId,
  });

  useEffect(() => {
    const controller = new AbortController();

    fetch(
      `/api/relationships/${selectedId}?domain=${encodeURIComponent(domainSlug)}`,
      {
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          relationship?: RelationshipDetail;
        };

        if (!response.ok || !payload.relationship) {
          throw new Error(payload.error ?? "Relationship could not be loaded.");
        }

        return payload.relationship;
      })
      .then((relationship) => {
        setState({
          domainSlug,
          error: null,
          isLoading: false,
          relationship,
          selectedId,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          domainSlug,
          error:
            error instanceof Error
              ? error.message
              : "Relationship could not be loaded.",
          isLoading: false,
          relationship: null,
          selectedId,
        });
      });

    return () => controller.abort();
  }, [domainSlug, selectedId]);

  const matchesCurrentRequest =
    state.domainSlug === domainSlug && state.selectedId === selectedId;
  const isLoading = state.isLoading || !matchesCurrentRequest;
  const relationship = matchesCurrentRequest ? state.relationship : null;
  const error = matchesCurrentRequest ? state.error : null;

  if (isLoading) {
    return <RelationshipInspectorSkeleton />;
  }

  if (relationship) {
    return <RelationshipInspectorCard relationship={relationship} />;
  }

  return (
    <InspectorError
      title="Relationship unavailable"
      message={error ?? "Relationship could not be loaded."}
    />
  );
}

function TypeInspector({
  domainSlug,
  selectedId,
}: {
  domainSlug: string;
  selectedId: string;
}) {
  const [state, setState] = useState<TypeDetailState>({
    domainSlug,
    error: null,
    isLoading: true,
    selectedId,
    type: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/types/${selectedId}?domain=${encodeURIComponent(domainSlug)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          type?: TypeDetail;
        };

        if (!response.ok || !payload.type) {
          throw new Error(payload.error ?? "Type could not be loaded.");
        }

        return payload.type;
      })
      .then((type) => {
        setState({
          domainSlug,
          error: null,
          isLoading: false,
          selectedId,
          type,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          domainSlug,
          error:
            error instanceof Error
              ? error.message
              : "Type could not be loaded.",
          isLoading: false,
          selectedId,
          type: null,
        });
      });

    return () => controller.abort();
  }, [domainSlug, selectedId]);

  const matchesCurrentRequest =
    state.domainSlug === domainSlug && state.selectedId === selectedId;
  const isLoading = state.isLoading || !matchesCurrentRequest;
  const type = matchesCurrentRequest ? state.type : null;
  const error = matchesCurrentRequest ? state.error : null;

  if (isLoading) {
    return <TypeInspectorSkeleton />;
  }

  if (type) {
    return <TypeInspectorCard type={type} />;
  }

  return (
    <InspectorError
      title="Type unavailable"
      message={error ?? "Type could not be loaded."}
    />
  );
}

function RunInspectorCard({
  run,
  selectedStep,
}: {
  run: LabRunDetail;
  selectedStep: LabRunStepView | null;
}) {
  return (
    <section className="flex min-h-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Run
          </p>
          <h2 className="mt-3 truncate font-heading text-xl font-semibold">
            {run.documentLabel}
          </h2>
        </div>
        <RunStatusBadge status={run.status} />
      </div>

      <div className="grid gap-3 rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm">
        <InspectorMetaRow label="Domain" value={run.domainSlug} />
        <InspectorMetaRow label="Run" value={shortHash(run.id)} />
        <InspectorMetaRow
          label="Current step"
          value={formatStep(run.currentStep)}
        />
        <InspectorMetaRow label="Created" value={formatDate(run.createdAt)} />
        {run.startedAt ? (
          <InspectorMetaRow label="Started" value={formatDate(run.startedAt)} />
        ) : null}
        {run.completedAt ? (
          <InspectorMetaRow
            label="Completed"
            value={formatDate(run.completedAt)}
          />
        ) : null}
        {run.workshopHref ? (
          <Button asChild size="sm" variant="outline">
            <Link href={run.workshopHref}>
              <ExternalLink data-icon="inline-start" />
              Open bundle
            </Link>
          </Button>
        ) : null}
      </div>

      {run.errorMessage ? (
        <p className="rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {run.errorMessage}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <DocumentMetric label="Claims" value={run.totals.claimCount} />
        <DocumentMetric label="Tokens" value={run.totals.tokenTotal} />
        <DocumentMetric
          label="Cost"
          value={formatRunCost(run.totals.costTotal)}
        />
      </div>

      <section className="grid gap-2 rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm">
        <h3 className="text-sm font-semibold">Steps</h3>
        <div className="flex flex-wrap gap-2">
          {run.steps.map((step) => (
            <Badge key={step.id} variant="outline">
              {formatStep(step.step)} / {step.status}
            </Badge>
          ))}
        </div>
      </section>

      {selectedStep ? (
        <RunStepInspector step={selectedStep} />
      ) : (
        <p className="rounded-[var(--radius-md)] border border-border bg-card p-3 text-sm text-muted-foreground shadow-sm">
          No step selected.
        </p>
      )}
    </section>
  );
}

function RunStepInspector({ step }: { step: LabRunStepView }) {
  const requestStatus = modelRequestStatus(step.rawOutput);
  const diagnostics = modelObservability(step.rawOutput);

  return (
    <section className="grid gap-3 rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{formatStep(step.step)}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {requestStatus ? (
            <Badge variant="secondary">{requestStatus}</Badge>
          ) : null}
          <RunStatusBadge status={step.status} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DocumentMetric label="Claims" value={step.claimCount} />
        <DocumentMetric label="Dropped" value={step.droppedUngrounded} />
        <DocumentMetric label="Tokens" value={step.tokenTotal} />
        <DocumentMetric label="Latency" value={formatLatency(step.latencyMs)} />
      </div>
      {step.errorMessage ? (
        <p className="rounded-[var(--radius-sm)] border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          {step.errorMessage}
        </p>
      ) : null}
      <RunArtifactBlock label="Input Context" value={step.inputContext} />
      <RunArtifactBlock label="Result Summary" value={step.resultSummary} />
      {diagnostics ? (
        <RunArtifactBlock label="Model Diagnostics" value={diagnostics} />
      ) : null}
      <RunArtifactBlock label="Raw Output" value={step.rawOutput} />
      <RunArtifactBlock label="Token Usage" value={step.tokenUsage} />
      <RunArtifactBlock label="Cost" value={step.cost} />
    </section>
  );
}

function RunArtifactBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-sm)] border border-border bg-muted/20">
      <div className="border-b border-border px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </div>
      <pre className="max-h-52 overflow-auto p-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
        {prettyJson(value)}
      </pre>
    </div>
  );
}

function DomainOverviewCard({ overview }: { overview: DomainOverview }) {
  const description = overview.domain.description?.trim();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Domain
          </p>
          <h2 className="mt-3 truncate font-heading text-xl font-semibold">
            {overview.domain.label}
          </h2>
        </div>
        {overview.status ? (
          <Badge variant="outline">{overview.status.label}</Badge>
        ) : null}
      </div>

      {description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {overview.inventory.map((item) => (
          <DocumentMetric
            key={item.key}
            label={item.label}
            value={item.count}
          />
        ))}
      </div>
    </section>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const variant = status === "failed" ? "destructive" : "outline";

  return <Badge variant={variant}>{formatStep(status)}</Badge>;
}

function DomainMapInspectorCard({ snapshot }: { snapshot: DomainMapSnapshot }) {
  const map = snapshot.activeMap;

  if (!map) {
    return null;
  }

  const intent = map.description?.trim() ?? "";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Domain Map
          </p>
          <h2 className="mt-3 truncate font-heading text-xl font-semibold">
            {map.label}
          </h2>
        </div>
        {map.statusLabel ? (
          <Badge
            variant="outline"
            className="border-primary/40 bg-primary/10 text-primary"
          >
            {map.statusLabel}
          </Badge>
        ) : null}
      </div>

      {map.mapKindLabel ? (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{map.mapKindLabel}</Badge>
        </div>
      ) : null}

      {intent ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {intent}
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          No map intent.
        </p>
      )}

      <Separator />

      <div className="grid grid-cols-2 gap-2">
        <DomainMapMetric label="Nodes" value={snapshot.nodes.length} />
        <DomainMapMetric label="Edges" value={snapshot.relationships.length} />
      </div>
    </section>
  );
}

function DomainMapMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card px-3 py-2 shadow-sm">
      <div className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-heading text-lg font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

function DocumentInspectorCard({ prepared }: { prepared: PreparedDocument }) {
  const { document, sourceUnits, toc } = prepared;
  const sourceLabel =
    document.sourceFilename ?? document.sourceUrl ?? "Prepared Markdown source";
  const unitBodyLength = sourceUnits.reduce(
    (total, unit) => total + unit.body.length,
    0
  );

  return (
    <section className="flex min-h-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Document
          </p>
          <h2 className="mt-3 truncate font-heading text-xl font-semibold">
            {document.label}
          </h2>
        </div>
        <Badge
          variant="outline"
          className="border-primary/40 bg-primary/10 text-primary"
        >
          {document.preparationState}
        </Badge>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        {sourceLabel}
      </p>

      {document.errorMessage ? (
        <p className="rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {document.errorMessage}
        </p>
      ) : null}

      <Separator />

      <div className="grid grid-cols-2 gap-2">
        <DocumentMetric label="Source Units" value={sourceUnits.length} />
        <DocumentMetric label="Size" value={formatBytes(document.sizeBytes)} />
        <DocumentMetric label="Body" value={formatBytes(unitBodyLength)} />
        <DocumentMetric label="Format" value={document.sourceType} />
      </div>

      <DocumentMetadata prepared={prepared} />

      <DocumentOutline entries={toc} sourceUnits={sourceUnits} />
    </section>
  );
}

function DocumentMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card px-3 py-2 shadow-sm">
      <div className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 truncate font-heading text-lg font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

function DocumentMetadata({ prepared }: { prepared: PreparedDocument }) {
  const { document } = prepared;

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold">Metadata</h3>
      <div className="grid gap-3">
        <InspectorMetaRow
          label="Source"
          value={document.sourceFilename ?? document.sourceUrl ?? "n/a"}
        />
        <InspectorMetaRow label="MIME" value={document.mimeType ?? "n/a"} />
        <InspectorMetaRow
          label="Content"
          value={shortHash(document.contentSha256)}
        />
        <InspectorMetaRow label="Body" value={shortHash(document.bodySha256)} />
        <InspectorMetaRow
          label="Updated"
          value={formatDate(document.updatedAt)}
        />
      </div>
    </div>
  );
}

function DocumentOutline({
  entries,
  sourceUnits,
}: {
  entries: PreparedDocument["toc"];
  sourceUnits: SourceUnitRecord[];
}) {
  const defaultTab = entries.length ? "outline" : "units";

  return (
    <section className="flex h-[32rem] min-h-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Navigation</h3>
        <Badge variant="secondary">{sourceUnits.length}</Badge>
      </div>
      <Tabs
        defaultValue={defaultTab}
        className="min-h-0 flex-1 overflow-hidden"
      >
        <TabsList className="grid w-full shrink-0 grid-cols-2 rounded-[var(--radius-sm)]">
          <TabsTrigger
            value="outline"
            className="min-w-0 gap-1 rounded-[calc(var(--radius-sm)-2px)] px-1 text-xs"
          >
            Outline
          </TabsTrigger>
          <TabsTrigger
            value="units"
            className="min-w-0 gap-1 rounded-[calc(var(--radius-sm)-2px)] px-1 text-xs"
          >
            Units
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="outline"
          className="mt-3 min-h-0 flex-1 overflow-hidden"
        >
          <ScrollArea className="h-full">
            {entries.length > 0 ? (
              <nav aria-label="Document outline" className="space-y-1 pr-2">
                {entries.map((entry) => (
                  <a
                    key={entry.anchorId}
                    href={`#${entry.anchorId}`}
                    className="block rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    style={{ paddingLeft: `${0.5 + entry.depth * 0.75}rem` }}
                  >
                    {entry.label}
                  </a>
                ))}
              </nav>
            ) : (
              <p className="p-2 text-sm text-muted-foreground">
                No headings were detected.
              </p>
            )}
          </ScrollArea>
        </TabsContent>
        <TabsContent
          value="units"
          className="mt-3 min-h-0 flex-1 overflow-hidden"
        >
          <ScrollArea className="h-full">
            <nav aria-label="Source units" className="space-y-1 pr-2">
              {sourceUnits.map((unit) => (
                <a
                  key={unit.id}
                  href={`#source-unit-${unit.position}`}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <span>Unit {unit.position + 1}</span>
                  <span>{formatBytes(unit.sizeBytes)}</span>
                </a>
              ))}
            </nav>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function InspectorMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="truncate text-sm">{value}</p>
    </div>
  );
}

function SubjectInspectorCard({
  domainSlug,
  onRelatedChange,
  subject,
}: {
  domainSlug: string;
  onRelatedChange: () => void;
  subject: SubjectDetail;
}) {
  const description = subject.description.trim();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Subject
          </p>
          <h2 className="mt-3 truncate font-heading text-xl font-semibold">
            {subject.canonicalLabel}
          </h2>
        </div>
        {subject.subjectType ? (
          <Badge
            variant="outline"
            className="border-primary/40 bg-primary/10 text-primary"
          >
            {subject.subjectType.label}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {subject.source ? (
          <Badge variant="outline">{subject.source}</Badge>
        ) : null}
      </div>
      {description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          No description.
        </p>
      )}
      <Separator />
      <SubjectRelatedPanel
        domainSlug={domainSlug}
        onChange={onRelatedChange}
        subject={subject}
      />
    </section>
  );
}

function ClaimInspectorCard({
  claim,
  domainSlug,
  onRelatedChange,
}: {
  claim: ClaimDetail;
  domainSlug: string;
  onRelatedChange: () => void;
}) {
  const claimText = claim.claimText.trim();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            {claim.reviewId}
          </p>
          <h2 className="mt-3 truncate font-heading text-xl font-semibold">
            {claim.displayTitle}
          </h2>
        </div>
      </div>
      {claimText ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {claimText}
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          No claim text.
        </p>
      )}
      <Separator />
      <ClaimRelatedPanel
        claim={claim}
        domainSlug={domainSlug}
        onChange={onRelatedChange}
      />
    </section>
  );
}

function ClaimRelatedPanel({
  claim,
  domainSlug,
  onChange,
}: {
  claim: ClaimDetail;
  domainSlug: string;
  onChange: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Related</h3>
        <ButtonGroup>
          <RelatedToolbarButton
            label="Add target"
            onClick={() => {
              setError(null);
              setDialogOpen(true);
            }}
          >
            <Plus />
          </RelatedToolbarButton>
        </ButtonGroup>
      </div>
      {error ? <FieldError className="mb-2">{error}</FieldError> : null}
      <div className="rounded-[var(--radius-sm)] border border-border bg-background/60">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center border-b border-border px-2 py-1.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          <span>Targets</span>
          <Badge variant="secondary" className="px-1 tabular-nums">
            {claim.targets.length}
          </Badge>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {claim.targets.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {claim.targets.map((target) => (
                <li key={target.id}>
                  <div className="rounded-[var(--radius-sm)] border border-border bg-background/60 p-2">
                    <p className="truncate text-sm font-medium">
                      {target.label}
                    </p>
                    <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                      {target.targetRole}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <RelatedEmpty
              title="No targets"
              description="No subjects are targeted by this claim yet."
            />
          )}
        </div>
      </div>
      <AddClaimTargetDialog
        claim={claim}
        domainSlug={domainSlug}
        onClose={() => setDialogOpen(false)}
        onDone={() => {
          setDialogOpen(false);
          window.dispatchEvent(new Event("memoria:shelf-refresh"));
          onChange();
        }}
        onError={setError}
        open={dialogOpen}
      />
    </section>
  );
}

function RelationshipInspectorCard({
  relationship,
}: {
  relationship: RelationshipDetail;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Relationship
          </p>
          <h2 className="mt-3 truncate font-heading text-xl font-semibold">
            {relationship.displayTitle}
          </h2>
        </div>
      </div>
      <div className="rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-sm">
          <span className="truncate font-medium">
            {relationship.source.label}
          </span>
          <span className="text-primary">{"->"}</span>
          <span className="truncate text-right font-medium">
            {relationship.target.label}
          </span>
        </div>
      </div>
    </section>
  );
}

function TypeInspectorCard({ type }: { type: TypeDetail }) {
  const description = type.description.trim();
  const captureGuidance = type.captureGuidance.trim();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Type
          </p>
          <h2 className="mt-3 truncate font-heading text-xl font-semibold">
            {type.label}
          </h2>
        </div>
        <Badge
          variant="outline"
          className="border-primary/40 bg-primary/10 text-primary"
        >
          {type.classLabel}
        </Badge>
      </div>
      <div className="grid gap-3 rounded-[var(--radius-md)] border border-border bg-card p-3">
        <InspectorMetaRow label="Class" value={type.classLabel} />
        <InspectorMetaRow label="Slug" value={type.slug} />
      </div>
      <div className="grid gap-2">
        <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Description
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description || "No description."}
        </p>
      </div>
      <Separator />
      <div className="grid gap-2">
        <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Capture guidance
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {captureGuidance || "No capture guidance."}
        </p>
      </div>
    </section>
  );
}

function SubjectRelatedPanel({
  domainSlug,
  onChange,
  subject,
}: {
  domainSlug: string;
  onChange: () => void;
  subject: SubjectDetail;
}) {
  const { related } = subject;
  const [dialog, setDialog] = useState<RelatedCrudDialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const defaultTab = related.claims.length
    ? "claims"
    : related.relationships.length
      ? "relationships"
      : "aliases";
  const [activeTab, setActiveTab] = useState<RelatedTab>(defaultTab);
  const [selectedByTab, setSelectedByTab] = useState<
    Partial<Record<RelatedTab, string>>
  >({});
  const selectedId = selectedByTab[activeTab] ?? null;
  const selectedAlias =
    activeTab === "aliases"
      ? (related.aliases.find((alias) => alias.id === selectedId) ?? null)
      : null;

  async function deleteRelated(
    kind: "alias" | "claim" | "relationship",
    id: string
  ) {
    setPendingDeleteId(id);
    setError(null);

    try {
      const result =
        kind === "alias"
          ? await deleteLexicalizationShellAction(id, domainSlug)
          : await deleteShelfItemShellAction(
              domainSlug,
              kind as Extract<ShelfClassKey, "claim" | "relationship">,
              id
            );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      window.dispatchEvent(new Event("memoria:shelf-refresh"));
      onChange();
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Related record could not be deleted."
      );
    } finally {
      setPendingDeleteId(null);
    }
  }

  function closeDialog() {
    setDialog(null);
  }

  function finishDialog() {
    setDialog(null);
    window.dispatchEvent(new Event("memoria:shelf-refresh"));
    onChange();
  }

  function selectRelated(tab: RelatedTab, id: string) {
    setSelectedByTab((current) => ({ ...current, [tab]: id }));
  }

  function createSelectedRelated() {
    if (activeTab === "claims") {
      setDialog({ kind: "claim", mode: "create", selectedId: null });
      return;
    }

    if (activeTab === "relationships") {
      setDialog({ kind: "relationship", mode: "create", selectedId: null });
      return;
    }

    setDialog({ alias: null, kind: "alias", mode: "create" });
  }

  function editSelectedRelated() {
    if (!selectedId) {
      return;
    }

    if (activeTab === "claims") {
      setDialog({ kind: "claim", mode: "edit", selectedId });
      return;
    }

    if (activeTab === "relationships") {
      setDialog({ kind: "relationship", mode: "edit", selectedId });
      return;
    }

    if (selectedAlias) {
      setDialog({ alias: selectedAlias, kind: "alias", mode: "edit" });
    }
  }

  function deleteSelectedRelated() {
    if (!selectedId) {
      return;
    }

    const kind =
      activeTab === "claims"
        ? "claim"
        : activeTab === "relationships"
          ? "relationship"
          : "alias";

    void deleteRelated(kind, selectedId);
  }

  return (
    <section className="flex h-[48rem] min-h-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Related</h3>
        <ButtonGroup>
          <RelatedToolbarButton
            label={`Add ${relatedTabLabel(activeTab)}`}
            onClick={createSelectedRelated}
          >
            <Plus />
          </RelatedToolbarButton>
          <ButtonGroupSeparator />
          <RelatedToolbarButton
            disabled={!selectedId}
            label={`Edit ${relatedTabLabel(activeTab)}`}
            onClick={editSelectedRelated}
          >
            <Pencil />
          </RelatedToolbarButton>
          <ButtonGroupSeparator />
          <RelatedToolbarButton
            disabled={!selectedId || pendingDeleteId === selectedId}
            label={`Delete ${relatedTabLabel(activeTab)}`}
            onClick={deleteSelectedRelated}
          >
            <Trash2 />
          </RelatedToolbarButton>
        </ButtonGroup>
      </div>
      {error ? <FieldError className="mb-2">{error}</FieldError> : null}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as RelatedTab)}
        className="min-h-0 flex-1 overflow-hidden"
      >
        <TabsList className="grid w-full shrink-0 grid-cols-3 rounded-[var(--radius-sm)]">
          <TabsTrigger
            value="claims"
            className="min-w-0 gap-1 rounded-[calc(var(--radius-sm)-2px)] px-1 text-xs"
          >
            <span className="truncate">Claims</span>
            <Badge variant="secondary" className="px-1 tabular-nums">
              {related.claims.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="aliases"
            className="min-w-0 gap-1 rounded-[calc(var(--radius-sm)-2px)] px-1 text-xs"
          >
            <span className="truncate">Aliases</span>
            <Badge variant="secondary" className="px-1 tabular-nums">
              {related.aliases.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="relationships"
            className="min-w-0 gap-1 rounded-[calc(var(--radius-sm)-2px)] px-1 text-xs"
          >
            <span className="truncate">Relations</span>
            <Badge variant="secondary" className="px-1 tabular-nums">
              {related.relationships.length}
            </Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="claims" className="min-h-0 overflow-y-auto pr-1">
          <RelatedClaims
            claims={related.claims}
            selectedId={selectedByTab.claims ?? null}
            onSelect={(claimId) => selectRelated("claims", claimId)}
          />
        </TabsContent>
        <TabsContent value="aliases" className="min-h-0 overflow-y-auto pr-1">
          <RelatedAliases
            aliases={related.aliases}
            selectedId={selectedByTab.aliases ?? null}
            onSelect={(aliasId) => selectRelated("aliases", aliasId)}
          />
        </TabsContent>
        <TabsContent
          value="relationships"
          className="min-h-0 overflow-y-auto pr-1"
        >
          <RelatedRelationships
            relationships={related.relationships}
            selectedId={selectedByTab.relationships ?? null}
            onSelect={(relationshipId) =>
              selectRelated("relationships", relationshipId)
            }
          />
        </TabsContent>
      </Tabs>
      {dialog?.kind === "claim" ? (
        <RecordCrudDialog
          classKey="claim"
          domainSlug={domainSlug}
          initialClaimTargetSubjectId={subject.id}
          mode={dialog.mode}
          onClose={closeDialog}
          onDone={finishDialog}
          open
          selectedId={dialog.selectedId}
        />
      ) : null}
      {dialog?.kind === "relationship" ? (
        <RecordCrudDialog
          classKey="relationship"
          domainSlug={domainSlug}
          initialRelationshipSourceSubjectId={subject.id}
          mode={dialog.mode}
          onClose={closeDialog}
          onDone={finishDialog}
          open
          selectedId={dialog.selectedId}
        />
      ) : null}
      {dialog?.kind === "alias" ? (
        <AliasCrudDialog
          alias={dialog.alias}
          domainSlug={domainSlug}
          mode={dialog.mode}
          objectId={subject.id}
          onClose={closeDialog}
          onDone={finishDialog}
          open
        />
      ) : null}
    </section>
  );
}

function AddClaimTargetDialog({
  claim,
  domainSlug,
  onClose,
  onDone,
  onError,
  open,
}: {
  claim: ClaimDetail;
  domainSlug: string;
  onClose: () => void;
  onDone: () => void;
  onError: (message: string | null) => void;
  open: boolean;
}) {
  const [options, setOptions] = useState<ClaimFormOptions | null>(null);
  const [targetSubjectId, setTargetSubjectId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const existingTargetIds = new Set(
    claim.targets.map((target) => target.targetObjectId)
  );
  const availableTargets =
    options?.targets.filter((target) => !existingTargetIds.has(target.id)) ??
    [];

  useEffect(() => {
    if (!open) {
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setTargetSubjectId("");
    onError(null);

    fetch(
      `/api/claims?domain=${encodeURIComponent(domainSlug)}&include=options`,
      {
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          options?: ClaimFormOptions;
        };

        if (!response.ok || !payload.options) {
          throw new Error(
            payload.error ?? "Claim targets could not be loaded."
          );
        }

        return payload.options;
      })
      .then((nextOptions) => {
        setOptions(nextOptions);
        setIsLoading(false);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setOptions(null);
        setIsLoading(false);
        onError(
          caught instanceof Error
            ? caught.message
            : "Claim targets could not be loaded."
        );
      });

    return () => controller.abort();
  }, [domainSlug, onError, open]);

  async function submitTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!targetSubjectId || pending) {
      return;
    }

    setPending(true);
    onError(null);

    try {
      const result = await updateClaimShellAction(claim.id, domainSlug, {
        targetSubjectIds: [
          ...claim.targets.map((target) => target.targetObjectId),
          targetSubjectId,
        ],
      });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      onDone();
    } catch (caught: unknown) {
      onError(
        caught instanceof Error ? caught.message : "Claim target was not added."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      {open ? (
        <DialogContent className="p-0 sm:max-w-md" showCloseButton={false}>
          <Card className="border-0 py-6 shadow-none">
            <form
              className="contents"
              onSubmit={(event) => void submitTarget(event)}
            >
              <CardHeader className="gap-2">
                <CardAction>
                  <DialogClose asChild>
                    <Button
                      aria-label="Close target form"
                      disabled={pending}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <X />
                    </Button>
                  </DialogClose>
                </CardAction>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
                  Claim Target
                </p>
                <CardTitle>Add Target</CardTitle>
                <CardDescription>
                  Attach another subject to this claim.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel>Target</FieldLabel>
                    <Select
                      disabled={
                        pending || isLoading || availableTargets.length === 0
                      }
                      value={targetSubjectId}
                      onValueChange={setTargetSubjectId}
                    >
                      <SelectTrigger aria-label="Select claim target">
                        <SelectValue
                          placeholder={
                            isLoading ? "Loading targets" : "Select target"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {availableTargets.map((target) => (
                            <SelectItem key={target.id} value={target.id}>
                              {target.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGroup>
                {!isLoading && availableTargets.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    All available subjects are already targets.
                  </p>
                ) : null}
              </CardContent>
              <CardFooter className="justify-end gap-3 border-t">
                <Button
                  disabled={pending}
                  onClick={onClose}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  disabled={!targetSubjectId || pending || isLoading}
                  type="submit"
                >
                  {pending ? "Adding" : "Add target"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function RelatedToolbarButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      size="icon-sm"
      title={label}
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}

function relatedTabLabel(tab: RelatedTab) {
  if (tab === "claims") {
    return "claim";
  }

  if (tab === "relationships") {
    return "relationship";
  }

  return "alias";
}

function RelatedAliases({
  aliases,
  onSelect,
  selectedId,
}: {
  aliases: SubjectAliasRelatedItem[];
  onSelect: (aliasId: string) => void;
  selectedId: string | null;
}) {
  if (aliases.length === 0) {
    return <RelatedEmpty title="No aliases" description="No aliases yet." />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {aliases.map((alias) => (
        <li key={alias.id} className="contents">
          <button
            className={cn(
              "w-full rounded-[var(--radius-sm)] border border-border bg-background/60 p-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
              selectedId === alias.id &&
                "border-primary/40 bg-primary/10 text-primary"
            )}
            onClick={() => onSelect(alias.id)}
            type="button"
          >
            <p className="truncate text-sm font-medium leading-snug">
              {alias.value}
            </p>
            <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {alias.lexicalType} / {alias.language}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RelatedClaims({
  claims,
  onSelect,
  selectedId,
}: {
  claims: SubjectClaimRelatedItem[];
  onSelect: (claimId: string) => void;
  selectedId: string | null;
}) {
  if (claims.length === 0) {
    return (
      <RelatedEmpty
        title="No claims"
        description="No claims target this subject yet."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {claims.map((claim) => (
        <li key={`${claim.id}:${claim.targetRole}`} className="contents">
          <button
            className={cn(
              "relative w-full rounded-[var(--radius-sm)] border border-border bg-background/60 p-2 pb-7 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
              selectedId === claim.id &&
                "border-primary/40 bg-primary/10 text-primary"
            )}
            onClick={() => onSelect(claim.id)}
            type="button"
          >
            <p className="text-sm leading-relaxed text-muted-foreground">
              {claim.claimText}
            </p>
            <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {claim.targetRole}
            </p>
            <span className="absolute right-2 bottom-2 rounded-[var(--radius-xs)] bg-primary/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none tracking-[0.08em] text-primary uppercase">
              {claim.reviewId}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RelatedRelationships({
  onSelect,
  relationships,
  selectedId,
}: {
  onSelect: (relationshipId: string) => void;
  relationships: SubjectRelationshipRelatedItem[];
  selectedId: string | null;
}) {
  if (relationships.length === 0) {
    return (
      <RelatedEmpty
        title="No relationships"
        description="No relationships are linked to this subject yet."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {relationships.map((relationship) => (
        <li key={relationship.id} className="contents">
          <button
            className={cn(
              "w-full rounded-[var(--radius-sm)] border border-border bg-background/60 p-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
              selectedId === relationship.id &&
                "border-primary/40 bg-primary/10 text-primary"
            )}
            onClick={() => onSelect(relationship.id)}
            type="button"
          >
            <p className="truncate text-sm font-medium">{relationship.label}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {relationship.otherSubjectLabel ??
                relationship.otherSubjectId ??
                "Unknown subject"}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function AliasCrudDialog({
  alias,
  domainSlug,
  mode,
  objectId,
  onClose,
  onDone,
  open,
}: {
  alias: SubjectAliasRelatedItem | null;
  domainSlug: string;
  mode: RecordCrudMode;
  objectId: string;
  onClose: () => void;
  onDone: () => void;
  open: boolean;
}) {
  const [form, setForm] = useState<AliasFormValue>(() => ({
    language: alias?.language ?? "en",
    lexicalType: alias?.lexicalType ?? "alias",
    value: alias?.value ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const editing = mode === "edit";

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result =
        editing && alias
          ? await updateLexicalizationShellAction(alias.id, domainSlug, {
              language: form.language,
              lexicalType: form.lexicalType,
              value: form.value,
            })
          : await createLexicalizationShellAction(domainSlug, {
              language: form.language,
              lexicalType: form.lexicalType,
              objectId,
              value: form.value,
            });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      onDone();
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : "Alias could not be saved."
      );
    } finally {
      setPending(false);
    }
  }

  const canSubmit = Boolean(
    form.value.trim() && form.lexicalType && form.language
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>{editing ? "Edit Alias" : "Create Alias"}</DialogTitle>
          <DialogDescription>Alias details</DialogDescription>
        </DialogHeader>
        <Card className="border-0 py-8 shadow-none [--card-spacing:--spacing(8)]">
          <form
            className="contents"
            onSubmit={(event) => void submitForm(event)}
          >
            <CardHeader className="gap-2">
              <CardAction className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className="border-primary/40 bg-primary/10 text-primary"
                >
                  {editing ? "Edit" : "New"}
                </Badge>
                <DialogClose asChild>
                  <Button
                    aria-label="Close alias form"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <X />
                  </Button>
                </DialogClose>
              </CardAction>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
                Alias
              </p>
              <CardTitle className="text-2xl">
                {editing ? "Edit Alias" : "Create Alias"}
              </CardTitle>
              <CardDescription>Lexicalization details</CardDescription>
            </CardHeader>
            <CardContent className="pt-3">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="alias-value">Value</FieldLabel>
                  <Input
                    id="alias-value"
                    disabled={pending}
                    value={form.value}
                    onChange={(event) => {
                      const value = event.currentTarget.value;

                      setForm((current) => ({
                        ...current,
                        value,
                      }));
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel>Type</FieldLabel>
                  <Select
                    disabled={pending}
                    value={form.lexicalType}
                    onValueChange={(lexicalType) =>
                      setForm((current) => ({ ...current, lexicalType }))
                    }
                  >
                    <SelectTrigger aria-label="Select alias type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="alias">Alias</SelectItem>
                        <SelectItem value="former_label">
                          Former label
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="alias-language">Language</FieldLabel>
                  <Input
                    id="alias-language"
                    disabled={pending}
                    value={form.language}
                    onChange={(event) => {
                      const language = event.currentTarget.value;

                      setForm((current) => ({
                        ...current,
                        language,
                      }));
                    }}
                  />
                </Field>
              </FieldGroup>
              {error ? <FieldError className="mt-4">{error}</FieldError> : null}
            </CardContent>
            <CardFooter className="justify-end gap-3 border-t">
              <Button
                className="min-w-24"
                disabled={pending}
                onClick={onClose}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className="min-w-24"
                disabled={pending || !canSubmit}
                type="submit"
              >
                {editing ? "Save" : "Create"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </DialogContent>
    </Dialog>
  );
}

function RelatedEmpty({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Empty className="min-h-24 border-0 p-3">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function DomainOverviewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-16 w-full" />
      <Separator />
      <div className="rounded-[var(--radius-md)] border border-border p-3">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-10 rounded-full" />
        </div>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-5 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

function DomainMapInspectorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-16 w-full" />
      <Separator />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="rounded-[var(--radius-md)] border border-border p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-5 w-28 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function RunInspectorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-5 w-28 rounded-full" />
      <div className="rounded-[var(--radius-md)] border border-border p-3">
        <div className="grid gap-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}

function DocumentInspectorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-5 w-28 rounded-full" />
      <Skeleton className="h-12 w-full" />
      <Separator />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="rounded-[var(--radius-md)] border border-border p-3">
        <Skeleton className="mb-3 h-4 w-20" />
        <div className="grid gap-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    </div>
  );
}

function SubjectInspectorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-16 w-full" />
      <Separator />
      <div className="rounded-[var(--radius-md)] border border-border p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="grid gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </div>
  );
}

function ClaimInspectorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function RelationshipInspectorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function TypeInspectorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-14" />
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-20 w-full" />
      <Separator />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

function InspectorError({
  message,
  title,
}: {
  message: string;
  title: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4">
      <Empty className="border-0 p-4">
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{message}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatStep(value: string) {
  const formatted = value.replaceAll("_", " ").trim();

  return formatted
    ? `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}`
    : "n/a";
}

function formatLatency(value: number | null) {
  if (value === null) {
    return "0 ms";
  }

  if (value < 1000) {
    return `${value} ms`;
  }

  return `${(value / 1000).toFixed(1)} s`;
}

function formatRunCost(value: number) {
  if (value === 0) {
    return "$0";
  }

  return `$${value.toFixed(6)}`;
}

function prettyJson(value: unknown) {
  if (value === undefined) {
    return "{}";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function modelRequestStatus(rawOutput: unknown) {
  if (!isRecord(rawOutput)) {
    return null;
  }

  if (rawOutput.status === "awaiting_model_response") {
    return "Awaiting model response";
  }

  const calls = rawOutput.calls;

  if (!Array.isArray(calls) || calls.length === 0) {
    return null;
  }

  const lastCall = calls.at(-1);

  if (isRecord(lastCall) && lastCall.status === "awaiting_response") {
    return "Awaiting model response";
  }

  return null;
}

function modelObservability(rawOutput: unknown) {
  if (!isRecord(rawOutput)) {
    return null;
  }

  const calls = rawOutput.calls;

  if (!Array.isArray(calls) || calls.length === 0) {
    return null;
  }

  const diagnostics = calls
    .map((call, index) => {
      if (!isRecord(call) || !isRecord(call.raw)) {
        return null;
      }

      const diagnostics = isRecord(call.raw.codexExec)
        ? call.raw.codexExec
        : call.raw.codex;

      if (!isRecord(diagnostics)) {
        return null;
      }

      return {
        attempt: call.attempt ?? index + 1,
        error: call.error,
        path: isRecord(call.raw.codexExec) ? "codex exec" : "app server",
        promptMetrics: diagnostics.promptMetrics,
        sourceUnitId: call.sourceUnitId,
        status: call.status,
        timing: diagnostics.timing,
        tokenUsage: diagnostics.tokenUsage,
      };
    })
    .filter(Boolean);

  return diagnostics.length > 0 ? diagnostics : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortHash(value: string) {
  return value ? value.slice(0, 12) : "n/a";
}
