"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { prepareDocumentAction } from "@/app/(shell)/workshop/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isImportableDocumentFile,
  mimeTypeForDocumentFile,
  sourceTypeForDocumentFile,
  titleFromFileName,
} from "@/lib/documents/document-files";
import { libraryDocumentImportEvent } from "@/lib/shell/events";

type LibraryDocumentFileIntakeProps = {
  domainSlug: string;
};

export function LibraryDocumentFileIntake({
  domainSlug,
}: LibraryDocumentFileIntakeProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const [documentForm, setDocumentForm] = useState("");
  const [importing, setImporting] = useState(false);
  const [label, setLabel] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    function openFilePicker() {
      inputRef.current?.click();
    }

    window.addEventListener(libraryDocumentImportEvent, openFilePicker);

    return () =>
      window.removeEventListener(libraryDocumentImportEvent, openFilePicker);
  }, []);

  async function importFile(file: File) {
    setStatus(null);
    setImporting(true);

    try {
      const sourceType = sourceTypeForDocumentFile(file);
      const formData = new FormData();
      formData.set("documentForm", documentForm);
      formData.set("domainSlug", domainSlug);
      formData.set("label", label);
      formData.set(
        sourceType === "html" ? "html" : "markdown",
        await file.text()
      );
      formData.set("mimeType", mimeTypeForDocumentFile(file));
      formData.set("sourceFilename", file.name);
      formData.set("sourceType", sourceType);

      const result = await prepareDocumentAction(formData);

      if (!result.ok) {
        setStatus(result.error.message);
        return;
      }

      if (!result.data) {
        setStatus("Document import did not return a prepared document.");
        return;
      }

      setStatus(
        result.data.alreadyExists
          ? `${result.data.label} is already in the workspace.`
          : `Imported ${result.data.label} with ${result.data.sourceUnitCount} source units.`
      );
      setPendingFile(null);
      setDocumentForm("");
      setLabel("");
      window.dispatchEvent(new Event("memoria:shelf-refresh"));

      const params = new URLSearchParams({
        class: "document",
        domain: domainSlug,
        sel: result.data.documentId,
      });

      router.replace(`/workshop?${params.toString()}`);
      router.refresh();
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <input
        accept=".md,.markdown,.html,.htm,text/markdown,text/html"
        aria-hidden={true}
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = "";

          if (file) {
            if (!isImportableDocumentFile(file)) {
              setStatus(
                "Only Markdown and HTML files can be imported right now."
              );
              return;
            }

            setDocumentForm(suggestDocumentForm(file));
            setLabel(titleFromFileName(file.name));
            setPendingFile(file);
            setStatus(null);
          }
        }}
        ref={inputRef}
        tabIndex={-1}
        type="file"
      />
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
      <Dialog
        open={Boolean(pendingFile)}
        onOpenChange={(open) => {
          if (!open && !importing) {
            setPendingFile(null);
            setDocumentForm("");
            setLabel("");
          }
        }}
      >
        <DialogContent>
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();

              if (pendingFile && documentForm.trim() && label.trim()) {
                void importFile(pendingFile);
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>Identify document</DialogTitle>
              <DialogDescription>{pendingFile?.name}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="document-label">Label</Label>
              <Input
                autoFocus
                id="document-label"
                maxLength={240}
                onChange={(event) => setLabel(event.target.value)}
                required
                value={label}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="document-form">Document form</Label>
              <Input
                id="document-form"
                maxLength={240}
                onChange={(event) => setDocumentForm(event.target.value)}
                placeholder="markdown document"
                required
                value={documentForm}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button disabled={importing} type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                disabled={importing || !documentForm.trim() || !label.trim()}
                type="submit"
              >
                Import
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function suggestDocumentForm(file: File) {
  const sourceType = sourceTypeForDocumentFile(file);

  if (sourceType === "html") {
    return "html document";
  }

  const title = titleFromFileName(file.name).toLowerCase();

  if (title.includes("runbook")) {
    return "runbook";
  }

  if (title.includes("guide")) {
    return "reference guide";
  }

  if (title.includes("notes")) {
    return "notes";
  }

  return "markdown document";
}
