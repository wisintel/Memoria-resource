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
import { DialogClose } from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createRelationshipShellAction,
  updateRelationshipShellAction,
} from "@/app/actions";
import type {
  RelationshipDetail,
  RelationshipFormOptions,
} from "@/domain/relationships";
import {
  modeLabel,
  type RecordCrudMode,
} from "@/components/shell/record-crud/shared";

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

const emptyRelationshipForm: RelationshipFormValue = {
  relationshipTypeId: "",
  sourceSubjectId: "",
  targetSubjectId: "",
};

export function RelationshipCrudCard({
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
