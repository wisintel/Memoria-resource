import { Suspense } from "react";
import { DocumentImportController } from "@/components/shell/DocumentImportController";
import { Inspector } from "@/components/shell/inspector/Inspector";
import { NavRail } from "@/components/shell/NavRail";
import { Shelf } from "@/components/shell/Shelf";
import { WorkshopDialogs } from "@/components/shell/WorkshopDialogs";
import { WorkspaceRefreshWatcher } from "@/components/shell/WorkspaceRefreshWatcher";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

type WorkshopShellProps = {
  children: React.ReactNode;
};

export function WorkshopShell({ children }: WorkshopShellProps) {
  return (
    <TooltipProvider>
      <SidebarProvider className="min-h-0">
        <div className="grid h-svh w-full min-h-0 grid-cols-[3.5rem_minmax(15rem,20rem)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden bg-background text-foreground lg:grid-cols-[3.5rem_minmax(16rem,22rem)_minmax(0,1fr)_minmax(21rem,28rem)]">
          <div className="min-h-0">
            <Suspense fallback={null}>
              <NavRail />
            </Suspense>
          </div>
          <div className="min-h-0 border-r border-border">
            <Suspense fallback={null}>
              <Shelf />
            </Suspense>
          </div>
          <div className="relative min-h-0 overflow-hidden">
            <main className="h-full min-h-0 overflow-auto bg-background">
              {children}
            </main>
          </div>
          <div className="hidden min-h-0 border-l border-border lg:block">
            <Suspense fallback={null}>
              <Inspector />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <DocumentImportController />
            <WorkspaceRefreshWatcher />
            <WorkshopDialogs />
          </Suspense>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
