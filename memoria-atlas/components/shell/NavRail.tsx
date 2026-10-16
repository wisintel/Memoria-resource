"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BookOpen, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function NavRail() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const domainSlug = searchParams.get("domain");
  const workshopHref = domainSlug
    ? `/workshop?${new URLSearchParams({ domain: domainSlug }).toString()}`
    : "/workshop";
  const settingsParams = new URLSearchParams(searchParams);
  settingsParams.set("dialog", "settings");
  const settingsHref = `${pathname}?${settingsParams.toString()}`;

  return (
    <nav
      aria-label="Primary navigation"
      className="flex h-full flex-col items-center gap-3 border-r border-border bg-sidebar px-2 py-3 text-sidebar-foreground"
    >
      <RailButton href="/" label="Project Memoria">
        <span className="font-heading text-sm font-semibold tracking-[0.08em] text-primary">
          M
        </span>
      </RailButton>

      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <RailButton
          href={workshopHref}
          label="Workshop"
          active={pathname === "/workshop"}
        >
          <BookOpen />
        </RailButton>
      </div>

      <RailButton href={settingsHref} label="Settings">
        <Settings />
      </RailButton>
    </nav>
  );
}

function RailButton({
  active = false,
  children,
  href,
  label,
}: {
  active?: boolean;
  children: React.ReactNode;
  href?: string;
  label: string;
}) {
  const button = (
    <Button
      asChild={Boolean(href)}
      type={href ? undefined : "button"}
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative rounded-[var(--radius)] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active &&
          "bg-transparent text-primary before:absolute before:top-2 before:bottom-2 before:-left-2 before:w-0.5 before:rounded-r before:bg-primary before:shadow-[0_0_8px_var(--primary)] hover:bg-primary/10 hover:text-primary"
      )}
    >
      {href ? <Link href={href}>{children}</Link> : children}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
