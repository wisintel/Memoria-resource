"use client";

import { ArrowLeftRight, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  claimModalityValues,
  type ClaimDetail,
  type ClaimFormOptions,
  type ClaimModality,
} from "@/domain/claims";
import type { DocumentFormOptions, PreparedDocument } from "@/domain/documents";
import type {
  RelationshipDetail,
  RelationshipFormOptions,
} from "@/domain/relationships";
import type {
  DocumentShelfFolder,
  DocumentShelfFolderItem,
  ShelfClassKey,
} from "@/domain/shelf";
import type { SubjectDetail, SubjectFormOptions } from "@/domain/subjects";
import type { TypeDetail, TypeFormOptions } from "@/domain/types";
import {
  createClaimShellAction,
  createRelationshipShellAction,
  createSubjectShellAction,
  createTypeShellAction,
  updateClaimShellAction,
  updateDocumentMetadataShellAction,
  updateRelationshipShellAction,
  updateSubjectShellAction,
  updateTypeShellAction,
} from "@/app/(shell)/actions";

export type RecordCrudMode = "create" | "edit";

type RecordCrudDialogProps = {
  classKey: ShelfClassKey;
  domainSlug: string;
  initialClaimModality?: string | null;
  initialClaimType?: string | null;
  initialClaimText?: string | null;
  initialClaimTargetSubjectId?: string | null;
  initialRelationshipSourceSubjectId?: string | null;
  initialRelationshipTargetSubjectId?: string | null;
  mode: RecordCrudMode;
  onClose: () => void;
  onDone: (selection?: { classKey: ShelfClassKey; id: string }) => void;
  open: boolean;
  selectedId: string | null;
};

type SubjectFormValue = {
  canonicalLabel: string;
  description: string;
  statusId: string;
  subjectTypeId: string;
};

type SubjectFormState = {
  error: string | null;
  form: SubjectFormValue;
  isLoading: boolean;
  options: SubjectFormOptions | null;
  subject: SubjectDetail | null;
};

type ClaimFormValue = {
  claimText: string;
  claimTypeId: string;
  modality: ClaimModality | "";
  targetSubjectId: string;
};

type ClaimFormState = {
  claim: ClaimDetail | null;
  error: string | null;
  form: ClaimFormValue;
  isLoading: boolean;
  options: ClaimFormOptions | null;
};

type RelationshipFormValue = {
  relationshipTypeId: string;
  sourceSubjectId: string;
  targetSubjectId: string;
};

type RelationshipFormState = {
  error: string | null;
  form: RelationshipFormValue;
  isLoading: boolean;
  options: RelationshipFormOptions | null;
  relationship: RelationshipDetail | null;
};

type TypeFormValue = {
  captureGuidance: string;
  classKey: "subject" | "claim" | "relationship";
  description: string;
  label: string;
  slug: string;
};

type TypeFormState = {
  error: string | null;
  form: TypeFormValue;
  isLoading: boolean;
  options: TypeFormOptions | null;
  type: TypeDetail | null;
};

type DocumentEditOptions = DocumentFormOptions & {
  folderItems: DocumentShelfFolderItem[];
  folders: DocumentShelfFolder[];
};

type DocumentFormValue = {
  documentTypeId: string;
  folderId: string;
  label: string;
};

type DocumentFormState = {
  document: PreparedDocument | null;
  error: string | null;
  form: DocumentFormValue;
  isLoading: boolean;
  options: DocumentEditOptions | null;
};

const emptySubjectForm: SubjectFormValue = {
  canonicalLabel: "",
  description: "",
  statusId: "",
  subjectTypeId: "",
};

const emptyClaimForm: ClaimFormValue = {
  claimText: "",
  claimTypeId: "",
  modality: "",
  targetSubjectId: "",
};

const emptyRelationshipForm: RelationshipFormValue = {
  relationshipTypeId: "",
  sourceSubjectId: "",
  targetSubjectId: "",
};

const emptyTypeForm: TypeFormValue = {
  captureGuidance: "",
  classKey: "subject",
  description: "",
  label: "",
  slug: "",
};

const emptyDocumentForm: DocumentFormValue = {
  documentTypeId: "",
  folderId: "",
  label: "",
};

const noSelectionValue = "__none__";

export function RecordCrudDialog({
  classKey,
  domainSlug,
  initialClaimModality,
  initialClaimType,
  initialClaimText,
  initialClaimTargetSubjectId,
  initialRelationshipSourceSubjectId,
  initialRelationshipTargetSubjectId,
  mode,
  onClose,
  onDone,
  open,
  selectedId,
}: RecordCrudDialogProps) {
  const recordLabel = classLabel(classKey);
  const title = titleForMode(mode, recordLabel);

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
        <DialogContent className="p-0 sm:max-w-xl" showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{recordLabel} details</DialogDescription>
          </DialogHeader>
          {classKey === "subject" ? (
            <SubjectCrudCard
              key={`${mode}:${selectedId ?? "new"}:${domainSlug}`}
              domainSlug={domainSlug}
              mode={mode}
              onClose={onClose}
              onDone={(id) => onDone({ classKey, id })}
              selectedId={selectedId}
              title={title}
            />
          ) : classKey === "claim" ? (
            <ClaimCrudCard
              key={`${mode}:${selectedId ?? "new"}:${domainSlug}:${initialClaimText ?? ""}:${initialClaimModality ?? ""}:${initialClaimType ?? ""}:${initialClaimTargetSubjectId ?? ""}`}
              domainSlug={domainSlug}
              initialClaimModality={initialClaimModality}
              initialClaimType={initialClaimType}
              initialClaimText={initialClaimText}
              initialTargetSubjectId={initialClaimTargetSubjectId}
              mode={mode}
              onClose={onClose}
              onDone={(id) => onDone({ classKey, id })}
              selectedId={selectedId}
              title={title}
            />
          ) : classKey === "relationship" ? (
            <RelationshipCrudCard
              key={`${mode}:${selectedId ?? "new"}:${domainSlug}`}
              domainSlug={domainSlug}
              initialSourceSubjectId={initialRelationshipSourceSubjectId}
              initialTargetSubjectId={initialRelationshipTargetSubjectId}
              mode={mode}
              onClose={onClose}
              onDone={(id) => onDone({ classKey, id })}
              selectedId={selectedId}
              title={title}
            />
          ) : classKey === "type" ? (
            <TypeCrudCard
              key={`${mode}:${selectedId ?? "new"}:${domainSlug}`}
              domainSlug={domainSlug}
              mode={mode}
              onDone={(id) => onDone({ classKey, id })}
              selectedId={selectedId}
              title={title}
            />
          ) : classKey === "document" && mode === "edit" ? (
            <DocumentCrudCard
              key={`${mode}:${selectedId ?? "new"}:${domainSlug}`}
              domainSlug={domainSlug}
              onClose={onClose}
              onDone={(id) => onDone({ classKey, id })}
              selectedId={selectedId}
              title={title}
            />
          ) : (
            <UnsupportedRecordCard
              mode={mode}
              onClose={onClose}
              recordLabel={recordLabel}
              title={title}
            />
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function TypeCrudCard({
  domainSlug,
  mode,
  onDone,
  selectedId,
  title,
}: {
  domainSlug: string;
  mode: RecordCrudMode;
  onDone: (id: string) => void;
  selectedId: string | null;
  title: string;
}) {
  const [state, setState] = useState<TypeFormState>({
    error: null,
    form: emptyTypeForm,
    isLoading: true,
    options: null,
    type: null,
  });
  const [pending, setPending] = useState(false);
  const editing = mode === "edit";

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      loadTypeOptions(controller.signal),
      editing && selectedId
        ? loadType(selectedId, domainSlug, controller.signal)
        : Promise.resolve(null),
    ])
      .then(([options, type]) => {
        setState({
          error: null,
          form: type ? formForType(type) : formForTypeOptions(options),
          isLoading: false,
          options,
          type,
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          error:
            caught instanceof Error
              ? caught.message
              : "Type form could not be loaded.",
          form: emptyTypeForm,
          isLoading: false,
          options: null,
          type: null,
        });
      });

    return () => controller.abort();
  }, [domainSlug, editing, selectedId]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setState((current) => ({ ...current, error: null }));

    try {
      const result = await submitTypeRequest({
        domainSlug,
        form: state.form,
        mode,
        type: state.type,
      });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      window.dispatchEvent(new Event("memoria:shelf-refresh"));
      onDone(result.data.id);
    } catch (caught: unknown) {
      setState((current) => ({
        ...current,
        error:
          caught instanceof Error ? caught.message : "Type could not be saved.",
      }));
    } finally {
      setPending(false);
    }
  }

  const canSubmit = Boolean(
    state.form.label.trim() &&
    state.form.classKey &&
    (!editing || state.type)
  );

  return (
    <Card className="border-0 py-8 shadow-none [--card-spacing:--spacing(8)]">
      <form className="contents" onSubmit={(event) => void submitForm(event)}>
        <CardHeader className="gap-2">
          <CardAction className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="border-primary/40 bg-primary/10 text-primary"
            >
              {modeLabel(mode)}
            </Badge>
            <DialogClose asChild>
              <Button
                aria-label="Close type form"
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </DialogClose>
          </CardAction>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
            Ontology
          </p>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>
            Add behavior-bearing vocabulary for extraction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading type form...</p>
          ) : (
            <FieldGroup>
              <Field>
                <FieldLabel>Class</FieldLabel>
                <Select
                  disabled={editing}
                  value={state.form.classKey}
                  onValueChange={(classKey) =>
                    setState((current) => ({
                      ...current,
                      form: {
                        ...current.form,
                        classKey: classKey as TypeFormValue["classKey"],
                      },
                    }))
                  }
                >
                  <SelectTrigger aria-label="Select type class">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(state.options?.classes ?? []).map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel>Label</FieldLabel>
                <Input
                  autoComplete="off"
                  value={state.form.label}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      form: { ...current.form, label: event.target.value },
                    }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel>Slug</FieldLabel>
                <Input
                  autoComplete="off"
                  placeholder="Derived from label"
                  value={state.form.slug}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      form: { ...current.form, slug: event.target.value },
                    }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel>Description</FieldLabel>
                <Textarea
                  rows={3}
                  value={state.form.description}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      form: {
                        ...current.form,
                        description: event.target.value,
                      },
                    }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel>Capture guidance</FieldLabel>
                <Textarea
                  maxLength={300}
                  rows={3}
                  value={state.form.captureGuidance}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      form: {
                        ...current.form,
                        captureGuidance: event.target.value,
                      },
                    }))
                  }
                />
              </Field>
            </FieldGroup>
          )}
          {state.error ? (
            <FieldError className="mt-4">{state.error}</FieldError>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end gap-2 border-t">
          <DialogClose asChild>
            <Button disabled={pending} type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button disabled={!canSubmit || pending} type="submit">
            {pending ? "Saving" : mode === "create" ? "Create" : "Save"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function SubjectCrudCard({
  domainSlug,
  mode,
  onClose,
  onDone,
  selectedId,
  title,
}: {
  domainSlug: string;
  mode: RecordCrudMode;
  onClose: () => void;
  onDone: (id: string) => void;
  selectedId: string | null;
  title: string;
}) {
  const [state, setState] = useState<SubjectFormState>({
    error: null,
    form: emptySubjectForm,
    isLoading: true,
    options: null,
    subject: null,
  });
  const [pending, setPending] = useState(false);
  const editing = mode === "edit";

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      loadSubjectOptions(domainSlug, controller.signal),
      editing && selectedId
        ? loadSubject(selectedId, controller.signal)
        : Promise.resolve(null),
    ])
      .then(([options, subject]) => {
        setState({
          error: null,
          form: subject ? formForSubject(subject) : formForOptions(options),
          isLoading: false,
          options,
          subject,
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          error:
            caught instanceof Error
              ? caught.message
              : "Subject form could not be loaded.",
          form: emptySubjectForm,
          isLoading: false,
          options: null,
          subject: null,
        });
      });

    return () => controller.abort();
  }, [domainSlug, editing, selectedId]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setState((current) => ({ ...current, error: null }));

    try {
      const result = await submitSubjectRequest({
        domainSlug,
        form: state.form,
        mode,
        subject: state.subject,
      });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      window.dispatchEvent(new Event("memoria:shelf-refresh"));
      onDone(result.data.id);
    } catch (caught: unknown) {
      setState((current) => ({
        ...current,
        error:
          caught instanceof Error
            ? caught.message
            : "Subject could not be saved.",
      }));
    } finally {
      setPending(false);
    }
  }

  const canSubmit = Boolean(
    state.form.canonicalLabel.trim() &&
    state.form.subjectTypeId &&
    state.form.statusId &&
    (!editing || state.subject)
  );

  return (
    <Card className="border-0 py-8 shadow-none [--card-spacing:--spacing(8)]">
      <form className="contents" onSubmit={(event) => void submitForm(event)}>
        <CardHeader className="gap-2">
          <CardAction className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="border-primary/40 bg-primary/10 text-primary"
            >
              {modeLabel(mode)}
            </Badge>
            <DialogClose asChild>
              <Button
                aria-label="Close subject form"
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </DialogClose>
          </CardAction>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
            Subject
          </p>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>Subject details</CardDescription>
        </CardHeader>
        <CardContent className="pt-3">
          <SubjectFields
            form={state.form}
            isLoading={state.isLoading}
            options={state.options}
            pending={pending}
            onChange={(nextForm) =>
              setState((current) => ({ ...current, form: nextForm }))
            }
          />
          {state.error ? (
            <FieldError className="mt-4">{state.error}</FieldError>
          ) : null}
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
            disabled={pending || state.isLoading || !canSubmit}
            type="submit"
          >
            {mode === "create" ? "Create" : "Save"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function ClaimCrudCard({
  domainSlug,
  initialClaimModality,
  initialClaimType,
  initialClaimText,
  initialTargetSubjectId,
  mode,
  onClose,
  onDone,
  selectedId,
  title,
}: {
  domainSlug: string;
  initialClaimModality?: string | null;
  initialClaimType?: string | null;
  initialClaimText?: string | null;
  initialTargetSubjectId?: string | null;
  mode: RecordCrudMode;
  onClose: () => void;
  onDone: (id: string) => void;
  selectedId: string | null;
  title: string;
}) {
  const [state, setState] = useState<ClaimFormState>({
    claim: null,
    error: null,
    form: emptyClaimForm,
    isLoading: true,
    options: null,
  });
  const [pending, setPending] = useState(false);
  const editing = mode === "edit";

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      loadClaimOptions(domainSlug, controller.signal),
      editing && selectedId
        ? loadClaim(selectedId, domainSlug, controller.signal)
        : Promise.resolve(null),
    ])
      .then(([options, claim]) => {
        setState({
          claim,
          error: null,
          form: claim
            ? formForClaim(claim)
            : formForClaimDefaults({
                modality: initialClaimModalityValue(initialClaimModality),
                claimTypeId: initialClaimTypeId(options, initialClaimType),
                claimText: initialClaimText,
                targetSubjectId: initialTargetSubjectId,
              }),
          isLoading: false,
          options,
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          claim: null,
          error:
            caught instanceof Error
              ? caught.message
              : "Claim form could not be loaded.",
          form: emptyClaimForm,
          isLoading: false,
          options: null,
        });
      });

    return () => controller.abort();
  }, [
    domainSlug,
    editing,
    initialClaimModality,
    initialClaimType,
    initialClaimText,
    initialTargetSubjectId,
    selectedId,
  ]);

  useEffect(() => {
    if (editing || !initialTargetSubjectId) {
      return;
    }

    setState((current) => {
      if (current.form.targetSubjectId === initialTargetSubjectId) {
        return current;
      }

      return {
        ...current,
        form: {
          ...current.form,
          targetSubjectId: initialTargetSubjectId,
        },
      };
    });
  }, [editing, initialTargetSubjectId]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setState((current) => ({ ...current, error: null }));

    try {
      const result = await submitClaimRequest({
        domainSlug,
        form: state.form,
        mode,
        claim: state.claim,
      });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      window.dispatchEvent(new Event("memoria:shelf-refresh"));
      onDone(result.data.id);
    } catch (caught: unknown) {
      setState((current) => ({
        ...current,
        error:
          caught instanceof Error
            ? caught.message
            : "Claim could not be saved.",
      }));
    } finally {
      setPending(false);
    }
  }

  const canSubmit = Boolean(
    state.form.claimText.trim() &&
    state.form.claimTypeId &&
    state.form.targetSubjectId &&
    (!editing || state.claim)
  );
  const displayTitle = claimDisplayTitle(state.form, state.options);

  return (
    <Card className="border-0 py-8 shadow-none [--card-spacing:--spacing(8)]">
      <form className="contents" onSubmit={(event) => void submitForm(event)}>
        <CardHeader className="gap-2">
          <CardAction className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="border-primary/40 bg-primary/10 text-primary"
            >
              {modeLabel(mode)}
            </Badge>
            <DialogClose asChild>
              <Button
                aria-label="Close claim form"
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </DialogClose>
          </CardAction>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
            Claim
          </p>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{displayTitle || "Claim details"}</CardDescription>
        </CardHeader>
        <CardContent className="pt-3">
          <ClaimFields
            form={state.form}
            isLoading={state.isLoading}
            options={state.options}
            pending={pending}
            onChange={(nextForm) =>
              setState((current) => ({ ...current, form: nextForm }))
            }
          />
          {state.error ? (
            <FieldError className="mt-4">{state.error}</FieldError>
          ) : null}
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
            disabled={pending || state.isLoading || !canSubmit}
            type="submit"
          >
            {mode === "create" ? "Create" : "Save"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function RelationshipCrudCard({
  domainSlug,
  initialSourceSubjectId,
  initialTargetSubjectId,
  mode,
  onClose,
  onDone,
  selectedId,
  title,
}: {
  domainSlug: string;
  initialSourceSubjectId?: string | null;
  initialTargetSubjectId?: string | null;
  mode: RecordCrudMode;
  onClose: () => void;
  onDone: (id: string) => void;
  selectedId: string | null;
  title: string;
}) {
  const [state, setState] = useState<RelationshipFormState>({
    error: null,
    form: emptyRelationshipForm,
    isLoading: true,
    options: null,
    relationship: null,
  });
  const [pending, setPending] = useState(false);
  const editing = mode === "edit";

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      loadRelationshipOptions(domainSlug, controller.signal),
      editing && selectedId
        ? loadRelationship(selectedId, domainSlug, controller.signal)
        : Promise.resolve(null),
    ])
      .then(([options, relationship]) => {
        setState({
          error: null,
          form: relationship
            ? formForRelationship(relationship)
            : formForRelationshipDefaults({
                sourceSubjectId: initialSourceSubjectId,
                targetSubjectId: initialTargetSubjectId,
              }),
          isLoading: false,
          options,
          relationship,
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          error:
            caught instanceof Error
              ? caught.message
              : "Relationship form could not be loaded.",
          form: emptyRelationshipForm,
          isLoading: false,
          options: null,
          relationship: null,
        });
      });

    return () => controller.abort();
  }, [
    domainSlug,
    editing,
    initialSourceSubjectId,
    initialTargetSubjectId,
    selectedId,
  ]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setState((current) => ({ ...current, error: null }));

    try {
      const result = await submitRelationshipRequest({
        domainSlug,
        form: state.form,
        mode,
        relationship: state.relationship,
      });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      window.dispatchEvent(new Event("memoria:shelf-refresh"));
      onDone(result.data.id);
    } catch (caught: unknown) {
      setState((current) => ({
        ...current,
        error:
          caught instanceof Error
            ? caught.message
            : "Relationship could not be saved.",
      }));
    } finally {
      setPending(false);
    }
  }

  const canSubmit = Boolean(
    state.form.relationshipTypeId &&
    state.form.sourceSubjectId &&
    state.form.targetSubjectId &&
    (!editing || state.relationship)
  );
  const displayTitle = relationshipDisplayTitle(state.form, state.options);

  return (
    <Card className="border-0 py-8 shadow-none [--card-spacing:--spacing(8)]">
      <form className="contents" onSubmit={(event) => void submitForm(event)}>
        <CardHeader className="gap-2">
          <CardAction className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="border-primary/40 bg-primary/10 text-primary"
            >
              {modeLabel(mode)}
            </Badge>
            <DialogClose asChild>
              <Button
                aria-label="Close relationship form"
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </DialogClose>
          </CardAction>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
            Relationship
          </p>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>
            {displayTitle || "Relationship details"}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-3">
          <RelationshipFields
            form={state.form}
            isLoading={state.isLoading}
            options={state.options}
            pending={pending}
            onChange={(nextForm) =>
              setState((current) => ({ ...current, form: nextForm }))
            }
          />
          {state.error ? (
            <FieldError className="mt-4">{state.error}</FieldError>
          ) : null}
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
            disabled={pending || state.isLoading || !canSubmit}
            type="submit"
          >
            {mode === "create" ? "Create" : "Save"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function DocumentCrudCard({
  domainSlug,
  onClose,
  onDone,
  selectedId,
  title,
}: {
  domainSlug: string;
  onClose: () => void;
  onDone: (id: string) => void;
  selectedId: string | null;
  title: string;
}) {
  const [state, setState] = useState<DocumentFormState>({
    document: null,
    error: null,
    form: emptyDocumentForm,
    isLoading: true,
    options: null,
  });
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    if (!selectedId) {
      setState({
        document: null,
        error: "Select a document before editing.",
        form: emptyDocumentForm,
        isLoading: false,
        options: null,
      });
      return () => controller.abort();
    }

    Promise.all([
      loadDocumentOptions(domainSlug, controller.signal),
      loadDocument(selectedId, domainSlug, controller.signal),
    ])
      .then(([options, document]) => {
        setState({
          document,
          error: null,
          form: formForDocument(document, options),
          isLoading: false,
          options,
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          document: null,
          error:
            caught instanceof Error
              ? caught.message
              : "Document form could not be loaded.",
          form: emptyDocumentForm,
          isLoading: false,
          options: null,
        });
      });

    return () => controller.abort();
  }, [domainSlug, selectedId]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedId) {
      return;
    }

    setPending(true);
    setState((current) => ({ ...current, error: null }));

    try {
      const result = await updateDocumentMetadataShellAction(
        selectedId,
        domainSlug,
        {
          documentTypeId: state.form.documentTypeId || null,
          folderId: state.form.folderId || null,
          label: state.form.label,
        }
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      window.dispatchEvent(new Event("memoria:shelf-refresh"));
      onDone(result.data.document.id);
    } catch (caught: unknown) {
      setState((current) => ({
        ...current,
        error:
          caught instanceof Error
            ? caught.message
            : "Document could not be saved.",
      }));
    } finally {
      setPending(false);
    }
  }

  const canSubmit = Boolean(state.form.label.trim() && selectedId);

  return (
    <Card className="border-0 py-8 shadow-none [--card-spacing:--spacing(8)]">
      <form className="contents" onSubmit={(event) => void submitForm(event)}>
        <CardHeader className="gap-2">
          <CardAction className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="border-primary/40 bg-primary/10 text-primary"
            >
              Edit
            </Badge>
            <DialogClose asChild>
              <Button
                aria-label="Close document form"
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </DialogClose>
          </CardAction>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
            Document
          </p>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>Document details</CardDescription>
        </CardHeader>
        <CardContent className="pt-3">
          <DocumentFields
            form={state.form}
            isLoading={state.isLoading}
            options={state.options}
            pending={pending}
            onChange={(nextForm) =>
              setState((current) => ({ ...current, form: nextForm }))
            }
          />
          {state.error ? (
            <FieldError className="mt-4">{state.error}</FieldError>
          ) : null}
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
            disabled={pending || state.isLoading || !canSubmit}
            type="submit"
          >
            Save
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function DocumentFields({
  form,
  isLoading,
  onChange,
  options,
  pending,
}: {
  form: DocumentFormValue;
  isLoading: boolean;
  onChange: (form: DocumentFormValue) => void;
  options: DocumentEditOptions | null;
  pending: boolean;
}) {
  const disabled = pending || isLoading;

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="document-label">Label</FieldLabel>
        <Input
          id="document-label"
          disabled={disabled}
          value={form.label}
          onChange={(event) =>
            onChange({
              ...form,
              label: event.currentTarget.value,
            })
          }
        />
      </Field>
      <Field>
        <FieldLabel>Document Type</FieldLabel>
        <Select
          disabled={disabled}
          value={form.documentTypeId || noSelectionValue}
          onValueChange={(documentTypeId) =>
            onChange({
              ...form,
              documentTypeId:
                documentTypeId === noSelectionValue ? "" : documentTypeId,
            })
          }
        >
          <SelectTrigger aria-label="Select document type">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={noSelectionValue}>None</SelectItem>
              {(options?.types ?? []).map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Folder</FieldLabel>
        <Select
          disabled={disabled}
          value={form.folderId || noSelectionValue}
          onValueChange={(folderId) =>
            onChange({
              ...form,
              folderId: folderId === noSelectionValue ? "" : folderId,
            })
          }
        >
          <SelectTrigger aria-label="Select document folder">
            <SelectValue placeholder="Unfiled" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={noSelectionValue}>Unfiled</SelectItem>
              {(options?.folders ?? []).map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  );
}

function SubjectFields({
  form,
  isLoading,
  onChange,
  options,
  pending,
}: {
  form: SubjectFormValue;
  isLoading: boolean;
  onChange: (form: SubjectFormValue) => void;
  options: SubjectFormOptions | null;
  pending: boolean;
}) {
  const disabled = pending || isLoading;

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="subject-label">Name</FieldLabel>
        <Input
          id="subject-label"
          disabled={disabled}
          value={form.canonicalLabel}
          onChange={(event) =>
            onChange({
              ...form,
              canonicalLabel: event.currentTarget.value,
            })
          }
        />
      </Field>
      <Field>
        <FieldLabel>Type</FieldLabel>
        <Select
          disabled={disabled}
          value={form.subjectTypeId}
          onValueChange={(subjectTypeId) =>
            onChange({
              ...form,
              subjectTypeId,
            })
          }
        >
          <SelectTrigger aria-label="Select subject type">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(options?.types ?? []).map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Status</FieldLabel>
        <Select
          disabled={disabled}
          value={form.statusId}
          onValueChange={(statusId) =>
            onChange({
              ...form,
              statusId,
            })
          }
        >
          <SelectTrigger aria-label="Select subject status">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(options?.statuses ?? []).map((status) => (
                <SelectItem key={status.id} value={status.id}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="subject-description">Description</FieldLabel>
        <Textarea
          id="subject-description"
          disabled={disabled}
          value={form.description}
          onChange={(event) =>
            onChange({
              ...form,
              description: event.currentTarget.value,
            })
          }
        />
      </Field>
    </FieldGroup>
  );
}

function ClaimFields({
  form,
  isLoading,
  onChange,
  options,
  pending,
}: {
  form: ClaimFormValue;
  isLoading: boolean;
  onChange: (form: ClaimFormValue) => void;
  options: ClaimFormOptions | null;
  pending: boolean;
}) {
  const disabled = pending || isLoading;
  const targetOptions = options?.targets ?? [];
  const targetIsInOptions = targetOptions.some(
    (target) => target.id === form.targetSubjectId
  );

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Type</FieldLabel>
        <Select
          disabled={disabled}
          value={form.claimTypeId}
          onValueChange={(claimTypeId) =>
            onChange({
              ...form,
              claimTypeId,
            })
          }
        >
          <SelectTrigger aria-label="Select claim type">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(options?.types ?? []).map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Modality</FieldLabel>
        <Select
          disabled={disabled}
          value={form.modality}
          onValueChange={(modality) =>
            onChange({
              ...form,
              modality: modality as ClaimFormValue["modality"],
            })
          }
        >
          <SelectTrigger aria-label="Select claim modality">
            <SelectValue placeholder="Select modality" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {claimModalityValues.map((modality) => (
                <SelectItem key={modality} value={modality}>
                  {modality}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Target</FieldLabel>
        <Select
          disabled={disabled}
          value={form.targetSubjectId}
          onValueChange={(targetSubjectId) =>
            onChange({
              ...form,
              targetSubjectId,
            })
          }
        >
          <SelectTrigger aria-label="Select claim target">
            <SelectValue placeholder="Select target" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {!targetIsInOptions && form.targetSubjectId ? (
                <SelectItem value={form.targetSubjectId}>
                  Selected target
                </SelectItem>
              ) : null}
              {targetOptions.map((target) => (
                <SelectItem key={target.id} value={target.id}>
                  {target.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="claim-text">Claim Text</FieldLabel>
        <Textarea
          id="claim-text"
          disabled={disabled}
          value={form.claimText}
          onChange={(event) =>
            onChange({
              ...form,
              claimText: event.currentTarget.value,
            })
          }
        />
      </Field>
    </FieldGroup>
  );
}

function RelationshipFields({
  form,
  isLoading,
  onChange,
  options,
  pending,
}: {
  form: RelationshipFormValue;
  isLoading: boolean;
  onChange: (form: RelationshipFormValue) => void;
  options: RelationshipFormOptions | null;
  pending: boolean;
}) {
  const disabled = pending || isLoading;

  function swapDirection() {
    onChange({
      ...form,
      sourceSubjectId: form.targetSubjectId,
      targetSubjectId: form.sourceSubjectId,
    });
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Source</FieldLabel>
        <Select
          disabled={disabled}
          value={form.sourceSubjectId}
          onValueChange={(sourceSubjectId) =>
            onChange({
              ...form,
              sourceSubjectId,
            })
          }
        >
          <SelectTrigger aria-label="Select relationship source">
            <SelectValue placeholder="Select source" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(options?.subjects ?? []).map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <div className="flex justify-center">
        <Button
          aria-label="Swap relationship direction"
          disabled={disabled}
          onClick={swapDirection}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <ArrowLeftRight data-icon="inline-start" />
        </Button>
      </div>
      <Field>
        <FieldLabel>Target</FieldLabel>
        <Select
          disabled={disabled}
          value={form.targetSubjectId}
          onValueChange={(targetSubjectId) =>
            onChange({
              ...form,
              targetSubjectId,
            })
          }
        >
          <SelectTrigger aria-label="Select relationship target">
            <SelectValue placeholder="Select target" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(options?.subjects ?? []).map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Type</FieldLabel>
        <Select
          disabled={disabled}
          value={form.relationshipTypeId}
          onValueChange={(relationshipTypeId) =>
            onChange({
              ...form,
              relationshipTypeId,
            })
          }
        >
          <SelectTrigger aria-label="Select relationship type">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(options?.types ?? []).map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  );
}

function UnsupportedRecordCard({
  mode,
  onClose,
  recordLabel,
  title,
}: {
  mode: RecordCrudMode;
  onClose: () => void;
  recordLabel: string;
  title: string;
}) {
  return (
    <Card className="border-0 py-8 shadow-none [--card-spacing:--spacing(8)]">
      <CardHeader className="gap-2">
        <CardAction>
          <DialogClose asChild>
            <Button
              aria-label="Close record form"
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X />
            </Button>
          </DialogClose>
        </CardAction>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
          {recordLabel}
        </p>
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>
          {mode === "create" ? "Create" : "Edit"} is not wired for this class
          yet.
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-end border-t">
        <Button className="min-w-24" onClick={onClose} type="button">
          Close
        </Button>
      </CardFooter>
    </Card>
  );
}

async function loadSubjectOptions(
  domainSlug: string,
  signal: AbortSignal
): Promise<SubjectFormOptions> {
  const response = await fetch(
    `/api/subjects?domain=${encodeURIComponent(domainSlug)}&include=options`,
    { signal }
  );
  const payload = (await response.json()) as {
    error?: string;
    options?: SubjectFormOptions;
  };

  if (!response.ok || !payload.options) {
    throw new Error(payload.error ?? "Subject options could not be loaded.");
  }

  return payload.options;
}

async function loadSubject(
  selectedId: string,
  signal: AbortSignal
): Promise<SubjectDetail> {
  const response = await fetch(`/api/subjects/${selectedId}`, { signal });
  const payload = (await response.json()) as {
    error?: string;
    subject?: SubjectDetail;
  };

  if (!response.ok || !payload.subject) {
    throw new Error(payload.error ?? "Subject could not be loaded.");
  }

  return payload.subject;
}

async function loadClaimOptions(
  domainSlug: string,
  signal: AbortSignal
): Promise<ClaimFormOptions> {
  const response = await fetch(
    `/api/claims?domain=${encodeURIComponent(domainSlug)}&include=options`,
    { signal }
  );
  const payload = (await response.json()) as {
    error?: string;
    options?: ClaimFormOptions;
  };

  if (!response.ok || !payload.options) {
    throw new Error(payload.error ?? "Claim options could not be loaded.");
  }

  return payload.options;
}

async function loadClaim(
  selectedId: string,
  domainSlug: string,
  signal: AbortSignal
): Promise<ClaimDetail> {
  const response = await fetch(
    `/api/claims/${selectedId}?domain=${encodeURIComponent(domainSlug)}`,
    { signal }
  );
  const payload = (await response.json()) as {
    claim?: ClaimDetail;
    error?: string;
  };

  if (!response.ok || !payload.claim) {
    throw new Error(payload.error ?? "Claim could not be loaded.");
  }

  return payload.claim;
}

async function loadRelationshipOptions(
  domainSlug: string,
  signal: AbortSignal
): Promise<RelationshipFormOptions> {
  const response = await fetch(
    `/api/relationships?domain=${encodeURIComponent(domainSlug)}&include=options`,
    { signal }
  );
  const payload = (await response.json()) as {
    error?: string;
    options?: RelationshipFormOptions;
  };

  if (!response.ok || !payload.options) {
    throw new Error(
      payload.error ?? "Relationship options could not be loaded."
    );
  }

  return payload.options;
}

async function loadRelationship(
  selectedId: string,
  domainSlug: string,
  signal: AbortSignal
): Promise<RelationshipDetail> {
  const response = await fetch(
    `/api/relationships/${selectedId}?domain=${encodeURIComponent(domainSlug)}`,
    { signal }
  );
  const payload = (await response.json()) as {
    error?: string;
    relationship?: RelationshipDetail;
  };

  if (!response.ok || !payload.relationship) {
    throw new Error(payload.error ?? "Relationship could not be loaded.");
  }

  return payload.relationship;
}

async function loadTypeOptions(signal: AbortSignal): Promise<TypeFormOptions> {
  const response = await fetch(`/api/types?include=options`, { signal });
  const payload = (await response.json()) as {
    error?: string;
    options?: TypeFormOptions;
  };

  if (!response.ok || !payload.options) {
    throw new Error(payload.error ?? "Type options could not be loaded.");
  }

  return payload.options;
}

async function loadType(
  selectedId: string,
  domainSlug: string,
  signal: AbortSignal
): Promise<TypeDetail> {
  const response = await fetch(
    `/api/types/${selectedId}?domain=${encodeURIComponent(domainSlug)}`,
    { signal }
  );
  const payload = (await response.json()) as {
    error?: string;
    type?: TypeDetail;
  };

  if (!response.ok || !payload.type) {
    throw new Error(payload.error ?? "Type could not be loaded.");
  }

  return payload.type;
}

async function loadDocumentOptions(
  domainSlug: string,
  signal: AbortSignal
): Promise<DocumentEditOptions> {
  const response = await fetch(
    `/api/documents?domain=${encodeURIComponent(domainSlug)}&include=options`,
    { signal }
  );
  const payload = (await response.json()) as {
    error?: string;
    folderItems?: DocumentShelfFolderItem[];
    folders?: DocumentShelfFolder[];
    options?: DocumentFormOptions;
  };

  if (!response.ok || !payload.options) {
    throw new Error(payload.error ?? "Document options could not be loaded.");
  }

  return {
    ...payload.options,
    folderItems: payload.folderItems ?? [],
    folders: payload.folders ?? [],
  };
}

async function loadDocument(
  selectedId: string,
  domainSlug: string,
  signal: AbortSignal
): Promise<PreparedDocument> {
  const response = await fetch(
    `/api/documents/${selectedId}?domain=${encodeURIComponent(domainSlug)}`,
    { signal }
  );
  const payload = (await response.json()) as {
    document?: PreparedDocument;
    error?: string;
  };

  if (!response.ok || !payload.document) {
    throw new Error(payload.error ?? "Document could not be loaded.");
  }

  return payload.document;
}

function formForOptions(options: SubjectFormOptions): SubjectFormValue {
  return {
    ...emptySubjectForm,
    statusId: options.statuses.find((status) => status.isDefault)?.id ?? "",
  };
}

function formForSubject(subject: SubjectDetail): SubjectFormValue {
  return {
    canonicalLabel: subject.canonicalLabel,
    description: subject.description,
    statusId: subject.statusId ?? "",
    subjectTypeId: subject.subjectTypeId ?? "",
  };
}

function formForClaim(claim: ClaimDetail): ClaimFormValue {
  return {
    claimText: claim.claimText,
    claimTypeId: claim.claimTypeId ?? "",
    modality: claim.modality ?? "",
    targetSubjectId: claim.primaryTarget?.targetObjectId ?? "",
  };
}

function formForClaimDefaults({
  modality,
  claimTypeId,
  claimText,
  targetSubjectId,
}: {
  modality?: ClaimModality | "" | null;
  claimTypeId?: string | null;
  claimText?: string | null;
  targetSubjectId?: string | null;
}): ClaimFormValue {
  return {
    ...emptyClaimForm,
    claimTypeId: claimTypeId ?? "",
    claimText: claimText ?? "",
    modality: modality ?? "",
    targetSubjectId: targetSubjectId ?? "",
  };
}

function initialClaimModalityValue(
  initialClaimModality?: string | null
): ClaimModality | "" {
  return claimModalityValues.includes(initialClaimModality as ClaimModality)
    ? (initialClaimModality as ClaimModality)
    : "";
}

function initialClaimTypeId(
  options: ClaimFormOptions,
  initialClaimType?: string | null
) {
  const normalizedInitial = normalizeOptionKey(initialClaimType);

  if (!normalizedInitial) {
    return "";
  }

  return (
    options.types.find(
      (type) =>
        normalizeOptionKey(type.slug) === normalizedInitial ||
        normalizeOptionKey(type.label) === normalizedInitial
    )?.id ?? ""
  );
}

function normalizeOptionKey(value?: string | null) {
  return value?.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase() ?? "";
}

function formForRelationship(
  relationship: RelationshipDetail
): RelationshipFormValue {
  return {
    relationshipTypeId: relationship.relationshipTypeId ?? "",
    sourceSubjectId: relationship.source.id,
    targetSubjectId: relationship.target.id,
  };
}

function formForRelationshipDefaults({
  sourceSubjectId,
  targetSubjectId,
}: {
  sourceSubjectId?: string | null;
  targetSubjectId?: string | null;
}): RelationshipFormValue {
  return {
    ...emptyRelationshipForm,
    sourceSubjectId: sourceSubjectId ?? "",
    targetSubjectId: targetSubjectId ?? "",
  };
}

function formForTypeOptions(options: TypeFormOptions): TypeFormValue {
  return {
    ...emptyTypeForm,
    classKey: options.classes[0]?.id ?? "subject",
  };
}

function formForType(type: TypeDetail): TypeFormValue {
  return {
    captureGuidance: type.captureGuidance,
    classKey: type.classKey,
    description: type.description,
    label: type.label,
    slug: type.slug,
  };
}

function formForDocument(
  document: PreparedDocument,
  options: DocumentEditOptions
): DocumentFormValue {
  const folderItem = options.folderItems.find(
    (item) => item.itemId === document.document.id
  );

  return {
    documentTypeId: document.document.documentTypeId ?? "",
    folderId: folderItem?.folderId ?? "",
    label: document.document.label,
  };
}

function claimDisplayTitle(
  form: ClaimFormValue,
  options: ClaimFormOptions | null
) {
  const claimType = options?.types.find((type) => type.id === form.claimTypeId);
  const target = options?.targets.find(
    (option) => option.id === form.targetSubjectId
  );

  if (!claimType || !target) {
    return "";
  }

  return `${claimType.label} - ${target.label}`;
}

function relationshipDisplayTitle(
  form: RelationshipFormValue,
  options: RelationshipFormOptions | null
) {
  const source = options?.subjects.find(
    (subject) => subject.id === form.sourceSubjectId
  );
  const type = options?.types.find(
    (relationshipType) => relationshipType.id === form.relationshipTypeId
  );
  const target = options?.subjects.find(
    (subject) => subject.id === form.targetSubjectId
  );

  if (!source || !type || !target) {
    return "";
  }

  return `${source.label} - ${type.label} - ${target.label}`;
}

function submitSubjectRequest({
  domainSlug,
  form,
  mode,
  subject,
}: {
  domainSlug: string;
  form: SubjectFormValue;
  mode: RecordCrudMode;
  subject: SubjectDetail | null;
}) {
  if (mode === "create") {
    return createSubjectShellAction(domainSlug, {
      canonicalLabel: form.canonicalLabel,
      description: form.description,
      statusId: form.statusId,
      subjectTypeId: form.subjectTypeId,
    });
  }

  if (!subject) {
    throw new Error("Subject was not loaded.");
  }

  return updateSubjectShellAction(subject.id, {
    canonicalLabel: form.canonicalLabel,
    description: form.description,
    statusId: form.statusId,
    subjectTypeId: form.subjectTypeId,
  });
}

function submitClaimRequest({
  claim,
  domainSlug,
  form,
  mode,
}: {
  claim: ClaimDetail | null;
  domainSlug: string;
  form: ClaimFormValue;
  mode: RecordCrudMode;
}) {
  if (mode === "create") {
    return createClaimShellAction(domainSlug, {
      claimText: form.claimText,
      claimTypeId: form.claimTypeId,
      ...(form.modality ? { modality: form.modality } : {}),
      targetSubjectId: form.targetSubjectId,
    });
  }

  if (!claim) {
    throw new Error("Claim was not loaded.");
  }

  return updateClaimShellAction(claim.id, domainSlug, {
    claimText: form.claimText,
    claimTypeId: form.claimTypeId,
    modality: form.modality || null,
    targetSubjectId: form.targetSubjectId,
  });
}

function submitRelationshipRequest({
  domainSlug,
  form,
  mode,
  relationship,
}: {
  domainSlug: string;
  form: RelationshipFormValue;
  mode: RecordCrudMode;
  relationship: RelationshipDetail | null;
}) {
  if (mode === "create") {
    return createRelationshipShellAction(domainSlug, {
      relationshipTypeId: form.relationshipTypeId,
      sourceSubjectId: form.sourceSubjectId,
      targetSubjectId: form.targetSubjectId,
    });
  }

  if (!relationship) {
    throw new Error("Relationship was not loaded.");
  }

  return updateRelationshipShellAction(relationship.id, domainSlug, {
    relationshipTypeId: form.relationshipTypeId,
    sourceSubjectId: form.sourceSubjectId,
    targetSubjectId: form.targetSubjectId,
  });
}

function submitTypeRequest({
  domainSlug,
  form,
  mode,
  type,
}: {
  domainSlug: string;
  form: TypeFormValue;
  mode: RecordCrudMode;
  type: TypeDetail | null;
}) {
  if (mode === "create") {
    return createTypeShellAction(domainSlug, {
      captureGuidance: form.captureGuidance,
      classKey: form.classKey,
      description: form.description,
      label: form.label,
      slug: form.slug || undefined,
    });
  }

  if (!type) {
    throw new Error("Type was not loaded.");
  }

  return updateTypeShellAction(type.id, domainSlug, {
    captureGuidance: form.captureGuidance,
    description: form.description,
    label: form.label,
    slug: form.slug,
  });
}

function classLabel(classKey: ShelfClassKey) {
  if (classKey === "domain_map") {
    return "Map";
  }

  return classKey
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function titleForMode(mode: RecordCrudMode, label: string) {
  if (mode === "create") {
    return `Create ${label}`;
  }

  return `Edit ${label}`;
}

function modeLabel(mode: RecordCrudMode) {
  if (mode === "create") {
    return "New";
  }

  return "Edit";
}
