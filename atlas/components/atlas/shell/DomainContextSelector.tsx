"use client";

import { Globe2 } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { allDomainsFilterValue, noDomainFilterValue } from "@/lib/domain-filter";
import type { DomainRecord } from "@/lib/supabase/client";

type DomainContextSelectorProps = {
  compact?: boolean;
  compactLabel?: string;
  domains: DomainRecord[];
  iconOnly?: boolean;
  isAllDomainsSelected?: boolean;
  routePath: string;
  selectedDomainId: string | null;
};

export function DomainContextSelector({
  compact = false,
  compactLabel,
  domains,
  iconOnly = false,
  isAllDomainsSelected = false,
  routePath,
  selectedDomainId,
}: DomainContextSelectorProps) {
  const router = useRouter();
  const selectedValue = isAllDomainsSelected ? allDomainsFilterValue : (selectedDomainId ?? noDomainFilterValue);

  return (
    <Select
      value={selectedValue}
      onValueChange={(domainId) => {
        if (domainId === null) {
          return;
        }

        router.push(
          domainId === noDomainFilterValue
            ? routePath
            : `${routePath}?domain=${encodeURIComponent(domainId)}`,
        );
      }}
    >
      <SelectTrigger
        aria-label="Switch domain"
        className={
          iconOnly
            ? "size-6 justify-center border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:text-sidebar-foreground"
            : compact
              ? "h-7 w-full justify-start rounded-none border-0 bg-transparent px-0 text-xl font-semibold text-foreground shadow-none focus-visible:ring-0"
              : "h-9 w-full border-[rgba(145,159,184,0.24)] bg-[linear-gradient(180deg,rgba(32,32,31,0.9),rgba(18,21,27,0.72))] px-3 text-xs shadow-none backdrop-blur-xl"
        }
      >
        {iconOnly ? null : (
          <>
            {compact ? null : <Globe2 className="size-3.5 text-primary" aria-hidden={true} />}
            <SelectValue placeholder="All">
              {(value: string | null) =>
                compactLabel ??
                (value === noDomainFilterValue
                  ? "None"
                  : value === allDomainsFilterValue
                    ? "All"
                    : (domains.find((domain) => domain.id === value)?.label ?? "Domain"))
              }
            </SelectValue>
          </>
        )}
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        <SelectGroup>
          <SelectItem value={noDomainFilterValue}>None</SelectItem>
          <SelectItem value={allDomainsFilterValue}>All</SelectItem>
          {domains.map((domain) => (
            <SelectItem key={domain.id} value={domain.id}>
              {domain.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
