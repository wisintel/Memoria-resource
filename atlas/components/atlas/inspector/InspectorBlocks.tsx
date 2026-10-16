import type { ComponentProps, ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent } from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function InspectorStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <FieldGroup className={cn("gap-0", className)}>{children}</FieldGroup>;
}

export function InspectorSection({
  bodyClassName,
  children,
  className,
  lede = false,
  meta,
  subtitle,
  title,
}: {
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  lede?: boolean;
  meta?: ReactNode;
  subtitle?: string;
  title?: ReactNode;
}) {
  return (
    <section data-lede={lede}>
      <FieldGroup className={cn("gap-0 px-5 pt-3", className)}>
        <InspectorHeader meta={meta} subtitle={subtitle} title={title} />
        <InspectorBody className={bodyClassName} lede={lede}>
          {children}
        </InspectorBody>
      </FieldGroup>
    </section>
  );
}

export function InspectorHeader({
  meta,
  subtitle,
  title,
}: {
  meta?: ReactNode;
  subtitle?: string;
  title?: ReactNode;
}) {
  const titleElement =
    typeof title === "string" ? (
      <FieldTitle className="truncate text-xl font-semibold text-foreground">
        <h1>{title}</h1>
      </FieldTitle>
    ) : title ? (
      <FieldTitle className="min-w-0 text-xl font-semibold text-foreground">
        {title}
      </FieldTitle>
    ) : null;

  return (
    <FieldGroup className="min-h-18 min-w-0 flex-row items-start justify-between gap-4">
      <FieldGroup className="min-w-0 flex-1 gap-2">
        {subtitle ? (
          <FieldDescription className="font-medium text-muted-foreground">
            {subtitle}
          </FieldDescription>
        ) : null}
        {titleElement}
      </FieldGroup>
      {meta ? <InspectorActionGroup>{meta}</InspectorActionGroup> : null}
    </FieldGroup>
  );
}

export function InspectorActionGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-fit shrink-0 items-center justify-end gap-2 pt-5">
      {children}
    </div>
  );
}

export function InspectorBody({
  children,
  className,
  lede = false,
}: {
  children: ReactNode;
  className?: string;
  lede?: boolean;
}) {
  return (
    <FieldGroup
      className={cn("gap-4", !lede && "border-t border-border pt-4", className)}
    >
      {children}
    </FieldGroup>
  );
}

export function InspectorPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className} size="sm">
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

export function InspectorForm({
  children,
  className,
  ...props
}: ComponentProps<"form">) {
  return (
    <form {...props}>
      <FieldGroup
        className={cn(
          "mb-3 gap-3 rounded-md border border-input p-3",
          className,
        )}
      >
        {children}
      </FieldGroup>
    </form>
  );
}

export function InspectorFormFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <FieldGroup
      className={cn(
        "flex-row justify-end gap-2 border-t border-border pt-4",
        className,
      )}
    >
      {children}
    </FieldGroup>
  );
}

export function InspectorFields({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <FieldGroup className={cn("gap-3", className)}>{children}</FieldGroup>;
}

export function InspectorField({
  compact = false,
  label,
  value,
}: {
  compact?: boolean;
  label: string;
  value: ReactNode;
}) {
  return (
    <Field>
      <FieldTitle className="text-sm font-medium text-muted-foreground">
        {label}
      </FieldTitle>
      <FieldDescription
        className={cn("text-sm text-foreground", compact && "truncate")}
      >
        {value}
      </FieldDescription>
    </Field>
  );
}

export function InspectorEmpty({ children }: { children: ReactNode }) {
  return (
    <Empty className="rounded-lg border border-dashed border-border p-4">
      <EmptyContent className="items-start text-left text-muted-foreground">
        {children}
      </EmptyContent>
    </Empty>
  );
}
