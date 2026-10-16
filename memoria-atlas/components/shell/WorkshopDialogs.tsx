"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DomainCrudDialog,
  type DomainCrudMode,
} from "@/components/shell/DomainCrudDialog";
import {
  RecordCrudDialog,
  type RecordCrudMode,
} from "@/components/shell/record-crud/RecordCrudDialog";
import { isShelfClassKey, type ShelfClassKey } from "@/domain/shelf";
import { markWorkshopClaimAdmittedAction } from "@/app/actions";

const shellDialogs = {
  settings: {
    title: "Settings",
    description: "Settings live here. Real preferences arrive later.",
  },
} as const;

type ShellDialogName = keyof typeof shellDialogs;
const domainCrudModes = ["archive", "create", "edit"] as const;
const recordCrudModes = ["create", "edit"] as const;

function isShellDialogName(value: string | null): value is ShellDialogName {
  return Boolean(value && value in shellDialogs);
}

function isDomainCrudMode(value: string | null): value is DomainCrudMode {
  return domainCrudModes.includes(value as DomainCrudMode);
}

function isRecordCrudMode(value: string | null): value is RecordCrudMode {
  return recordCrudModes.includes(value as RecordCrudMode);
}

export function WorkshopDialogs() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dialogName = searchParams.get("dialog");
  const domainSlug = searchParams.get("domain")?.trim() ?? "";
  const classParam = searchParams.get("class") ?? "";
  const initialClaimModality = searchParams.get("claimModality");
  const initialClaimType = searchParams.get("claimType");
  const initialClaimTargetSubjectId = searchParams.get("targetSubjectId");
  const initialClaimText = searchParams.get("claimText");
  const processClaimId = searchParams.get("processClaimId");
  const domainCrudMode = searchParams.get("mode");
  const selectedId = searchParams.get("sel");
  const recordCrudMode = searchParams.get("mode");
  const activeClass = isShelfClassKey(classParam) ? classParam : null;
  const activeDialog = isShellDialogName(dialogName)
    ? shellDialogs[dialogName]
    : null;
  const activeDomainCrudMode =
    dialogName === "domain-crud" && isDomainCrudMode(domainCrudMode)
      ? domainCrudMode
      : null;
  const activeRecordCrudMode =
    dialogName === "record-crud" && isRecordCrudMode(recordCrudMode)
      ? recordCrudMode
      : null;

  function closeDialog(nextDomainSlug?: string) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("dialog");
    nextParams.delete("mode");

    if (nextDomainSlug) {
      nextParams.set("domain", nextDomainSlug);
      nextParams.delete("sel");
    }

    const query = nextParams.toString();

    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  async function closeRecordDialog(nextSelection?: {
    classKey: ShelfClassKey;
    id: string;
  }) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("dialog");
    nextParams.delete("mode");
    nextParams.delete("claimText");
    nextParams.delete("claimModality");
    nextParams.delete("claimType");
    nextParams.delete("processClaimId");
    nextParams.delete("targetSubjectId");

    if (nextSelection?.classKey === "claim" && processClaimId) {
      const result = await markWorkshopClaimAdmittedAction(processClaimId, [
        nextSelection.id,
      ]);

      if (!result.ok) {
        window.alert(result.error.message);
        return;
      }

      nextParams.delete("claim");
    }

    if (nextSelection) {
      nextParams.set("class", nextSelection.classKey);
      nextParams.set("sel", nextSelection.id);
    }

    const query = nextParams.toString();

    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
    router.refresh();
  }

  if (activeDomainCrudMode) {
    return (
      <DomainCrudDialog
        domainSlug={domainSlug}
        mode={activeDomainCrudMode}
        open
        onClose={() => closeDialog()}
        onDone={(nextDomainSlug) => closeDialog(nextDomainSlug)}
      />
    );
  }

  if (activeRecordCrudMode && activeClass) {
    return (
      <RecordCrudDialog
        classKey={activeClass}
        domainSlug={domainSlug}
        initialClaimModality={initialClaimModality}
        initialClaimType={initialClaimType}
        initialClaimTargetSubjectId={initialClaimTargetSubjectId}
        initialClaimText={initialClaimText}
        mode={activeRecordCrudMode}
        open
        selectedId={selectedId}
        onClose={() => void closeRecordDialog()}
        onDone={(nextSelection) => void closeRecordDialog(nextSelection)}
      />
    );
  }

  return (
    <Dialog
      open={Boolean(activeDialog)}
      onOpenChange={(open) => {
        if (!open) {
          closeDialog();
        }
      }}
    >
      {activeDialog ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeDialog.title}</DialogTitle>
            <DialogDescription>{activeDialog.description}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
