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
  createTypeShellAction,
  updateTypeShellAction,
} from "@/app/actions";
import type { TypeDetail, TypeFormOptions } from "@/domain/types";
import {
  modeLabel,
  type RecordCrudMode,
} from "@/components/shell/record-crud/shared";

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

const emptyTypeForm: TypeFormValue = {
  captureGuidance: "",
  classKey: "subject",
  description: "",
  label: "",
  slug: "",
};

export function TypeCrudCard({
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
