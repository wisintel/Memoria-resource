"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Domain } from "@/domain/domains";
import {
  archiveDomainShellAction,
  createDomainShellAction,
  updateDomainShellAction,
} from "@/app/(shell)/actions";
import { domainCatalogChangedEvent } from "@/lib/shell/events";

export type DomainCrudMode = "archive" | "create" | "edit";

type DomainFormValue = {
  description: string;
  label: string;
};

type DomainCrudDialogProps = {
  domainSlug: string;
  mode: DomainCrudMode;
  onClose: () => void;
  onDone: (domainSlug?: string) => void;
  open: boolean;
};

const emptyForm: DomainFormValue = {
  description: "",
  label: "",
};

const recordLabel = "Domain";

export function DomainCrudDialog({
  domainSlug,
  mode,
  onClose,
  onDone,
  open,
}: DomainCrudDialogProps) {
  const title = useMemo(() => titleForMode(mode, recordLabel), [mode]);
  const completedRef = useRef(false);

  useEffect(() => {
    if (open) {
      completedRef.current = false;
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !completedRef.current) {
          onClose();
        }
      }}
    >
      {open ? (
        <DialogContent className="p-0 sm:max-w-xl" showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Domain details</DialogDescription>
          </DialogHeader>
          <DomainCrudCard
            key={`${mode}:${domainSlug}`}
            domainSlug={domainSlug}
            mode={mode}
            onClose={onClose}
            onDone={(nextDomainSlug) => {
              completedRef.current = true;
              onDone(nextDomainSlug);
            }}
            recordLabel={recordLabel}
            title={title}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function DomainCrudCard({
  domainSlug,
  mode,
  onClose,
  onDone,
  recordLabel,
  title,
}: Omit<DomainCrudDialogProps, "open"> & {
  recordLabel: string;
  title: string;
}) {
  const [domain, setDomain] = useState<Domain | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const editing = mode === "edit";
  const archiving = mode === "archive";

  useEffect(() => {
    if (mode === "create") {
      return;
    }

    const controller = new AbortController();

    fetch(`/api/domains?slug=${encodeURIComponent(domainSlug)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          domain?: Domain;
          error?: string;
        };

        if (!response.ok || !payload.domain) {
          throw new Error(payload.error ?? "Domain could not be loaded.");
        }

        return payload.domain;
      })
      .then((loadedDomain) => {
        setDomain(loadedDomain);
        setForm({
          description: loadedDomain.description ?? "",
          label: loadedDomain.label,
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setDomain(null);
        setError(
          caught instanceof Error
            ? caught.message
            : "Domain could not be loaded."
        );
      });

    return () => controller.abort();
  }, [domainSlug, mode]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result = await submitDomainRequest(mode, domain, form);

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      window.dispatchEvent(new Event(domainCatalogChangedEvent));
      onDone(mode === "archive" ? undefined : result.data.slug);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Domain could not be saved."
      );
    } finally {
      setPending(false);
    }
  }

  const canSubmit =
    archiving || Boolean(form.label.trim() && (!editing || domain));

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
                aria-label="Close domain form"
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
            {archiving ? "Archive the active domain." : "Domain details"}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-3">
          {archiving ? (
            <ArchiveDomainContent domain={domain} domainSlug={domainSlug} />
          ) : (
            <DomainFields form={form} pending={pending} onChange={setForm} />
          )}
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
            variant={archiving ? "destructive" : "default"}
          >
            {submitLabel(mode)}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function DomainFields({
  form,
  onChange,
  pending,
}: {
  form: DomainFormValue;
  onChange: React.Dispatch<React.SetStateAction<DomainFormValue>>;
  pending: boolean;
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="domain-label">Name</FieldLabel>
        <Input
          id="domain-label"
          disabled={pending}
          value={form.label}
          onChange={(event) => {
            const value = event.currentTarget.value;
            onChange((current) => ({ ...current, label: value }));
          }}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="domain-description">Description</FieldLabel>
        <Textarea
          id="domain-description"
          disabled={pending}
          value={form.description}
          onChange={(event) => {
            const value = event.currentTarget.value;
            onChange((current) => ({ ...current, description: value }));
          }}
        />
      </Field>
    </FieldGroup>
  );
}

function ArchiveDomainContent({
  domain,
  domainSlug,
}: {
  domain: Domain | null;
  domainSlug: string;
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>{domain?.label ?? domainSlug}</FieldLabel>
        <FieldDescription>
          This marks the domain archived. Existing records are preserved.
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}

function submitLabel(mode: DomainCrudMode) {
  if (mode === "create") {
    return "Create";
  }

  if (mode === "archive") {
    return "Archive";
  }

  return "Save";
}

function titleForMode(mode: DomainCrudMode, label: string) {
  if (mode === "create") {
    return `Create ${label}`;
  }

  if (mode === "archive") {
    return `Archive ${label}`;
  }

  return `Edit ${label}`;
}

function modeLabel(mode: DomainCrudMode) {
  if (mode === "create") {
    return "New";
  }

  if (mode === "archive") {
    return "Archive";
  }

  return "Edit";
}

function submitDomainRequest(
  mode: DomainCrudMode,
  domain: Domain | null,
  form: DomainFormValue
) {
  if (mode === "create") {
    return createDomainShellAction({
      description: form.description,
      label: form.label,
    });
  }

  if (!domain) {
    throw new Error("Domain was not loaded.");
  }

  if (mode === "archive") {
    return archiveDomainShellAction(domain.id);
  }

  return updateDomainShellAction(domain.id, {
    description: form.description,
    label: form.label,
  });
}
