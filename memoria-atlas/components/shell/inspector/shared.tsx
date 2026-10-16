import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export function InspectorError({
  message,
  title,
}: {
  message: string;
  title: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4">
      <Empty className="border-0 p-4">
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{message}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

export function InspectorMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="truncate text-sm">{value}</p>
    </div>
  );
}

export function DocumentMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card px-3 py-2 shadow-sm">
      <div className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 truncate font-heading text-lg font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

export function RunStatusBadge({ status }: { status: string }) {
  const variant = status === "failed" ? "destructive" : "outline";

  return <Badge variant={variant}>{formatStep(status)}</Badge>;
}

export function formatStep(value: string) {
  const formatted = value.replaceAll("_", " ").trim();

  return formatted
    ? `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}`
    : "n/a";
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function shortHash(value: string) {
  return value ? value.slice(0, 12) : "n/a";
}
