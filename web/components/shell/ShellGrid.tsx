import type { ReactNode } from "react";

type ShellGridProps = {
  navRail: ReactNode;
  shelf: ReactNode;
  stage: ReactNode;
  inspector: ReactNode;
  chrome: ReactNode;
};

export function ShellGrid({
  navRail,
  shelf,
  stage,
  inspector,
  chrome,
}: ShellGridProps) {
  return (
    <div className="grid h-svh w-full min-h-0 grid-cols-[3.5rem_minmax(15rem,20rem)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden bg-background text-foreground lg:grid-cols-[3.5rem_minmax(16rem,22rem)_minmax(0,1fr)_minmax(21rem,28rem)]">
      <div className="min-h-0">{navRail}</div>
      <div className="min-h-0 border-r border-border">{shelf}</div>
      <div className="relative min-h-0 overflow-hidden">
        {stage}
      </div>
      <div className="hidden min-h-0 border-l border-border lg:block">
        {inspector}
      </div>
      {chrome}
    </div>
  );
}
