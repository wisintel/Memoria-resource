"use client";

import { useSearchParams } from "next/navigation";
import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { ClaimInspector } from "@/components/shell/inspector/ClaimInspector";
import { DocumentInspector } from "@/components/shell/inspector/DocumentInspector";
import { DomainInspector } from "@/components/shell/inspector/DomainInspector";
import { DomainMapInspector } from "@/components/shell/inspector/DomainMapInspector";
import { RelationshipInspector } from "@/components/shell/inspector/RelationshipInspector";
import { RunInspector } from "@/components/shell/inspector/RunInspector";
import { SubjectInspector } from "@/components/shell/inspector/SubjectInspector";
import { TypeInspector } from "@/components/shell/inspector/TypeInspector";

export function Inspector() {
  const searchParams = useSearchParams();
  const domainSlug = searchParams.get("domain")?.trim() ?? "";
  const classKey =
    searchParams.get("inspectorClass") ?? searchParams.get("class");
  const selectedId =
    searchParams.get("inspectorSel") ?? searchParams.get("sel");
  const stepId = searchParams.get("step");

  return (
    <Sidebar side="right" collapsible="none" className="h-full min-h-0 w-full">
      <SidebarContent className="flex min-h-0 flex-col p-4">
        <div className="min-h-0 flex-1 overflow-hidden">
          {classKey === "subject" && selectedId ? (
            <SubjectInspector domainSlug={domainSlug} selectedId={selectedId} />
          ) : classKey === "run" && selectedId ? (
            <RunInspector
              domainSlug={domainSlug}
              selectedId={selectedId}
              stepId={stepId}
            />
          ) : classKey === "document" && selectedId ? (
            <DocumentInspector
              domainSlug={domainSlug}
              selectedId={selectedId}
            />
          ) : classKey === "claim" && selectedId ? (
            <ClaimInspector domainSlug={domainSlug} selectedId={selectedId} />
          ) : classKey === "relationship" && selectedId ? (
            <RelationshipInspector
              domainSlug={domainSlug}
              selectedId={selectedId}
            />
          ) : classKey === "type" && selectedId ? (
            <TypeInspector domainSlug={domainSlug} selectedId={selectedId} />
          ) : classKey === "domain_map" && selectedId ? (
            <DomainMapInspector
              domainSlug={domainSlug}
              selectedId={selectedId}
            />
          ) : (
            <DomainInspector domainSlug={domainSlug} />
          )}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
