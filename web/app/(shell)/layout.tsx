import { Chrome } from "@/components/shell/Chrome";
import { Inspector } from "@/components/shell/Inspector";
import { NavRail } from "@/components/shell/NavRail";
import { Shelf } from "@/components/shell/Shelf";
import { ShellGrid } from "@/components/shell/ShellGrid";
import { StageFrame } from "@/components/shell/StageFrame";
import { WorkspaceRefreshWatcher } from "@/components/shell/WorkspaceRefreshWatcher";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense } from "react";

export default function ShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <TooltipProvider>
      <SidebarProvider className="min-h-0">
        <ShellGrid
          navRail={
            <Suspense fallback={null}>
              <NavRail />
            </Suspense>
          }
          shelf={
            <Suspense fallback={null}>
              <Shelf />
            </Suspense>
          }
          stage={<StageFrame>{children}</StageFrame>}
          inspector={
            <Suspense fallback={null}>
              <Inspector />
            </Suspense>
          }
          chrome={
            <Suspense fallback={null}>
              <WorkspaceRefreshWatcher />
              <Chrome />
            </Suspense>
          }
        />
      </SidebarProvider>
    </TooltipProvider>
  );
}
