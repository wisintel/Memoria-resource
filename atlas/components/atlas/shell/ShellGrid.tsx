"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ShellBackdropVariant = "glow" | "grid";

type ShellGridProps = {
  backdrop?: ShellBackdropVariant;
  children: ReactNode;
  className?: string;
};

const shellGridBaseClassName =
  "fixed inset-0 isolate grid overflow-hidden bg-background text-foreground max-shell:grid-cols-1";

export function ShellGrid({ backdrop = "glow", children, className }: ShellGridProps) {
  return (
    <main className={cn(shellGridBaseClassName, className)}>
      <ShellBackdrop variant={backdrop} />
      {children}
    </main>
  );
}

function ShellBackdrop({ variant }: { variant: ShellBackdropVariant }) {
  if (variant === "glow") {
    return (
      <div aria-hidden={true} className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 shell-glow-landing" />
      </div>
    );
  }

  return (
    <div aria-hidden={true} className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 shell-glow" />
      <div className="absolute inset-0 grid-lines opacity-50 [mask-image:radial-gradient(72%_68%_at_50%_45%,#000_32%,transparent_82%)]" />
      <div className="absolute inset-0 stage-vignette" />
    </div>
  );
}
