import type { ReactNode } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type InspectorSectionVariant = "grid" | "single" | "compact" | "triple";

const sectionGridClass: Record<InspectorSectionVariant, string> = {
  compact: "grid-cols-2",
  grid: "grid-cols-2",
  single: "grid-cols-1",
  triple: "grid-cols-3"
};

export function RecordInspectorShell({ children }: { children: ReactNode }) {
  return (
    <aside className="min-h-0 min-w-0 overflow-auto border-l border-sidebar-border bg-card text-card-foreground max-lg:absolute max-lg:right-0 max-lg:bottom-0 max-lg:z-30 max-lg:max-h-96 max-lg:w-80 max-lg:border-t max-lg:shadow-xl">
      {children}
    </aside>
  );
}

export function RecordInspectorContent({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full flex-col gap-3 pb-4">{children}</div>;
}

export function RecordInspectorHero({
  action,
  eyebrow,
  title
}: {
  action?: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-sidebar-border px-4 py-3">
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{eyebrow}</div>
        <h2 className="mt-1 break-words text-lg font-semibold leading-tight text-foreground">{title}</h2>
      </div>
      {action ? <div className="flex items-center gap-1">{action}</div> : null}
    </header>
  );
}

export function RecordInspectorSection({
  children,
  className,
  showTitle = false,
  title,
  variant = "grid"
}: {
  children: ReactNode;
  className?: string;
  showTitle?: boolean;
  title: string;
  variant?: InspectorSectionVariant;
}) {
  return (
    <Card className={cn("mx-4 gap-0 rounded-lg border-sidebar-border py-0 shadow-none", className)} size="sm">
      {showTitle ? (
        <CardHeader className="border-b border-sidebar-border px-3 py-2">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className={cn("grid gap-2 p-2", sectionGridClass[variant])}>{children}</CardContent>
    </Card>
  );
}

export function RecordInspectorField({
  label,
  value,
  wide = false
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={cn("min-w-0 rounded-md border border-sidebar-border bg-muted/20 p-3", wide && "col-span-full")}>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium leading-snug text-foreground">{value}</div>
    </div>
  );
}

export function RecordInspectorList({ children }: { children: ReactNode }) {
  return <div className="col-span-full grid gap-2">{children}</div>;
}

export function RecordInspectorListItem({
  children,
  title
}: {
  children?: ReactNode;
  title: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-sidebar-border bg-muted/20 p-3">
      <strong className="block break-words text-sm font-semibold leading-tight text-foreground">{title}</strong>
      {children ? <div className="mt-1 break-words text-xs leading-snug text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function RecordInspectorStub({ children }: { children: ReactNode }) {
  return <p className="col-span-full m-0 p-3 text-xs leading-snug text-muted-foreground">{children}</p>;
}

export function RecordInspectorRelatedEmpty({
  children,
  title
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="grid min-h-28 place-items-center content-center gap-2 text-center text-muted-foreground">
      <strong className="text-sm font-semibold text-foreground">{title}</strong>
      <span className="max-w-60 text-xs leading-snug">{children}</span>
    </div>
  );
}

export function RecordInspectorRelatedCard({
  action,
  children,
  title
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <Card className="mx-4 max-h-120 min-h-48 gap-3 rounded-lg border-sidebar-border py-3 shadow-none" size="sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {action ? <CardAction className="static row-auto self-auto justify-self-auto">{action}</CardAction> : null}
      </CardHeader>
      <CardContent className="grid min-h-0 gap-3 px-3 pb-0">{children}</CardContent>
    </Card>
  );
}
