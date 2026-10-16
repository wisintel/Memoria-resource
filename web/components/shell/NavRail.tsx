"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BookOpen, Settings } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type SurfaceLink = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const surfaceLinks: SurfaceLink[] = [
  { href: "/workshop", label: "Workshop", icon: BookOpen },
];

export function NavRail() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const domainSlug = searchParams.get("domain");
  const settingsParams = new URLSearchParams(searchParams);
  settingsParams.set("dialog", "settings");
  const settingsHref = `${pathname}?${settingsParams.toString()}`;

  return (
    <nav
      aria-label="Application surfaces"
      className="flex h-full flex-col items-center gap-3 border-r border-border bg-sidebar px-2 py-3 text-sidebar-foreground"
    >
      <RailButton href="/" label="Project Memoria">
        <span className="font-heading text-sm font-semibold tracking-[0.08em] text-primary">
          M
        </span>
      </RailButton>

      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        {surfaceLinks.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <RailButton
              key={item.href}
              href={surfaceHref(item.href, domainSlug)}
              label={item.label}
              active={active}
            >
              <Icon />
            </RailButton>
          );
        })}
      </div>

      <RailButton href={settingsHref} label="Settings">
        <Settings />
      </RailButton>
    </nav>
  );
}

function surfaceHref(href: string, domainSlug: string | null) {
  if (!domainSlug) {
    return href;
  }

  const params = new URLSearchParams({ domain: domainSlug });

  return `${href}?${params.toString()}`;
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
