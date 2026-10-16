"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClaimCrudCard } from "@/components/shell/record-crud/claim";
import { DocumentCrudCard } from "@/components/shell/record-crud/document";
import { RelationshipCrudCard } from "@/components/shell/record-crud/relationship";
import { SubjectCrudCard } from "@/components/shell/record-crud/subject";
import { TypeCrudCard } from "@/components/shell/record-crud/type";
import {
  type RecordCrudDialogProps,
  type RecordCrudMode,
  UnsupportedRecordCard,
} from "@/components/shell/record-crud/shared";
import type { ShelfClassKey } from "@/domain/shelf";

export type { RecordCrudMode };

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
