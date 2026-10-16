"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmDialogProps = {
  cancelLabel?: string;
  children?: ReactNode;
  confirmLabel: string;
  description?: ReactNode;
  icon?: ReactNode;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  pendingLabel?: string;
  title: string;
  tone?: "default" | "destructive";
};

export function ConfirmDialog({
  cancelLabel = "Cancel",
  children,
  confirmLabel,
  description,
  icon,
  isPending = false,
  onCancel,
  onConfirm,
  open,
  pendingLabel,
  title,
  tone = "default",
}: ConfirmDialogProps) {
  const isDestructive = tone === "destructive";

  return (
    <AlertDialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isPending) {
          onCancel();
        }
      }}
      open={open}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>{icon ?? <AlertTriangle aria-hidden={true} />}</AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {children ? <div>{children}</div> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} onClick={onCancel}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={onConfirm}
            type="button"
            variant={isDestructive ? "destructive" : "default"}
          >
            {isPending ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
