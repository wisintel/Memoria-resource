"use client";

import { X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createLexicalizationShellAction,
  updateClaimShellAction,
  updateLexicalizationShellAction,
} from "@/app/actions";
import type {
  ClaimDetail,
  ClaimFormOptions,
} from "@/domain/claims";
import type {
  SubjectAliasRelatedItem,
  SubjectClaimRelatedItem,
  SubjectRelationshipRelatedItem,
} from "@/domain/subjects";
import type { RecordCrudMode } from "@/components/shell/record-crud/RecordCrudDialog";
import { cn } from "@/lib/utils";

type AliasFormValue = {
  language: string;
  lexicalType: string;
  value: string;
};

export type RelatedTab = "claims" | "aliases" | "relationships";

export function AddClaimTargetDialog({
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
  const requestKey = open ? `${domainSlug}:${claim.id}` : "";
  const [optionsState, setOptionsState] = useState<{
    isLoading: boolean;
    options: ClaimFormOptions | null;
    requestKey: string;
  }>({
    isLoading: false,
    options: null,
    requestKey: "",
  });
  const [targetSelection, setTargetSelection] = useState({
    requestKey: "",
    subjectId: "",
  });
  const [pending, setPending] = useState(false);
  const options =
    optionsState.requestKey === requestKey ? optionsState.options : null;
  const targetSubjectId =
    targetSelection.requestKey === requestKey ? targetSelection.subjectId : "";
  const isLoading =
    open && (optionsState.requestKey !== requestKey || optionsState.isLoading);
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
        setOptionsState({
          isLoading: false,
          options: nextOptions,
          requestKey,
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setOptionsState({
          isLoading: false,
          options: null,
          requestKey,
        });
        onError(
          caught instanceof Error
            ? caught.message
            : "Claim targets could not be loaded."
        );
      });

    return () => controller.abort();
  }, [domainSlug, onError, open, requestKey]);

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
                      onValueChange={(subjectId) =>
                        setTargetSelection({ requestKey, subjectId })
                      }
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

export function RelatedToolbarButton({
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

export function relatedTabLabel(tab: RelatedTab) {
  if (tab === "claims") {
    return "claim";
  }

  if (tab === "relationships") {
    return "relationship";
  }

  return "alias";
}

export function RelatedAliases({
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

export function RelatedClaims({
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

export function RelatedRelationships({
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

export function AliasCrudDialog({
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

export function RelatedEmpty({
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
