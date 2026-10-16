import type { CSSProperties, ReactNode, Ref } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppShell({
  chrome,
  inspector,
  rail,
  shelf,
  stage,
  stageRef
}: {
  chrome: ReactNode;
  inspector: ReactNode;
  rail: ReactNode;
  shelf: ReactNode;
  stage: ReactNode;
  stageRef: Ref<HTMLDivElement>;
}) {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen style={{ "--sidebar-width": "258px" } as CSSProperties}>
        <div className="app-shell dark">
          {rail}
          {shelf}
          <main className="stage-panel" ref={stageRef}>
            {stage}
          </main>
          {inspector}
          {chrome}
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
