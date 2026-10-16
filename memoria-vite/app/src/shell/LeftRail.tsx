import { Atom, BookOpen, Network } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type WorkspaceMode = "documents" | "pipeline" | "graph";

export function LeftRail({
  activeMode,
  onModeChange
}: {
  activeMode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
}) {
  return (
    <nav
      className="flex h-full flex-col items-center justify-center gap-2 border-r border-sidebar-border bg-sidebar px-2 py-2.5 text-sidebar-foreground max-[720px]:row-span-2 max-[720px]:row-start-1"
      aria-label="Workspace"
    >
      <LeftRailButton
        active={activeMode === "documents"}
        label="Library"
        onClick={() => onModeChange("documents")}
      >
        <BookOpen />
      </LeftRailButton>
      <LeftRailButton
        active={activeMode === "pipeline"}
        label="Workbench"
        onClick={() => onModeChange("pipeline")}
      >
        <Atom />
      </LeftRailButton>
      <LeftRailButton
        active={activeMode === "graph"}
        label="Graph"
        onClick={() => onModeChange("graph")}
      >
        <Network />
      </LeftRailButton>
    </nav>
  );
}

function LeftRailButton({
  active,
  children,
  label,
  onClick
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className={cn(
            "size-9 rounded-lg text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
            active && "bg-sidebar-accent text-foreground hover:bg-sidebar-accent/70"
          )}
          onClick={onClick}
          size="icon-sm"
          variant="ghost"
          type="button"
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
