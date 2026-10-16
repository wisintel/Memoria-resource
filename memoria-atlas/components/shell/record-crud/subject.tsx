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
  createSubjectShellAction,
  updateSubjectShellAction,
} from "@/app/actions";
import type { SubjectDetail, SubjectFormOptions } from "@/domain/subjects";
import {
  modeLabel,
  type RecordCrudMode,
} from "@/components/shell/record-crud/shared";

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

const emptySubjectForm: SubjectFormValue = {
  canonicalLabel: "",
  description: "",
  statusId: "",
  subjectTypeId: "",
};

export function SubjectCrudCard({
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
