"use client";

import { X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  createClaimShellAction,
  updateClaimShellAction,
} from "@/app/actions";
import {
  claimModalityValues,
  type ClaimDetail,
  type ClaimFormOptions,
  type ClaimModality,
} from "@/domain/claims";
import {
  modeLabel,
  normalizeOptionKey,
  type RecordCrudMode,
} from "@/components/shell/record-crud/shared";

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

const emptyClaimForm: ClaimFormValue = {
  claimText: "",
  claimTypeId: "",
  modality: "",
  targetSubjectId: "",
};

export function ClaimCrudCard({
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
