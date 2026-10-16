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
import { updateDocumentMetadataShellAction } from "@/app/actions";
import type { DocumentFormOptions, PreparedDocument } from "@/domain/documents";
import type {
  DocumentShelfFolder,
  DocumentShelfFolderItem,
} from "@/domain/shelf";

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

const emptyDocumentForm: DocumentFormValue = {
  documentTypeId: "",
  folderId: "",
  label: "",
};

const noSelectionValue = "__none__";

export function DocumentCrudCard({
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
