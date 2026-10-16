import { useEffect, useState } from "react";
import { AlertCircle, BadgeCheck, GitMerge, Inbox, Play, RefreshCcw, Save } from "lucide-react";
import {
  RecordInspectorContent,
  RecordInspectorField,
  RecordInspectorHero,
  RecordInspectorList,
  RecordInspectorListItem,
  RecordInspectorSection,
  RecordInspectorShell,
  RecordInspectorStub
} from "@/components/RecordInspector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { DomainRecord, GraphItemRecord, SubjectCandidatePackage } from "../../types";
import {
  domainContextLines,
  type DomainContextStats
} from "./domainContext";
import type { PipelineToolKey } from "./PipelineShelf";

const NO_MERGE_TARGET = "__no_merge_target__";

export function PipelineInspector({
  activeDomain,
  candidatePackage,
  domainContextModel,
  domainContextOutput,
  domainContextPrompt,
  domainContextRunError,
  domainContextStats,
  isBusy,
  selectedStage,
  subjects,
  onRefreshDomainContextOutput,
  onRunDomainContext,
  onSaveDomainContext,
  onResolveSubject
}: {
  activeDomain: DomainRecord | null;
  candidatePackage: SubjectCandidatePackage | null;
  domainContextModel: string;
  domainContextOutput: string;
  domainContextPrompt: string;
  domainContextRunError: string | null;
  domainContextStats: DomainContextStats;
  isBusy: boolean;
  selectedStage: PipelineToolKey;
  subjects: GraphItemRecord[];
  onRefreshDomainContextOutput: () => void;
  onRunDomainContext: (input: { model: string; prompt: string }) => void | Promise<void>;
  onSaveDomainContext: (profile: string) => void | Promise<void>;
  onResolveSubject: (
    localSubjectId: string,
    disposition: "admit" | "merge" | "reject",
    targetSubjectId?: string | null
  ) => void | Promise<void>;
}) {
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);

  useEffect(() => {
    setMergeTargetId(null);
  }, [candidatePackage?.localSubjectId]);

  if (selectedStage === "domain_context") {
    return (
      <DomainContextInspector
        activeDomain={activeDomain}
        domainContextModel={domainContextModel}
        domainContextOutput={domainContextOutput}
        domainContextPrompt={domainContextPrompt}
        domainContextRunError={domainContextRunError}
        domainContextStats={domainContextStats}
        isBusy={isBusy}
        onRefreshDomainContextOutput={onRefreshDomainContextOutput}
        onRunDomainContext={onRunDomainContext}
        onSaveDomainContext={onSaveDomainContext}
      />
    );
  }

  if (!candidatePackage) {
    return (
      <RecordInspectorShell>
        <Empty className="h-full p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>Select a subject</EmptyTitle>
            <EmptyDescription>Choose a subject candidate from the workbench registry to review it.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </RecordInspectorShell>
    );
  }

  const isPending = candidatePackage.status === "pending";

  return (
    <RecordInspectorShell>
      <RecordInspectorContent>
        <RecordInspectorHero
          action={<Badge variant="secondary">{candidatePackage.status}</Badge>}
          eyebrow="SUBJECT CANDIDATE"
          title={textValue(candidatePackage.subject.payload.label, "Untitled subject")}
        />

        <RecordInspectorSection showTitle title="Package" variant="single">
          <ReadField label="Type" value={textValue(candidatePackage.subject.payload.type, "subject")} />
          <ReadField label="Description" value={textValue(candidatePackage.subject.payload.description, "No description generated.")} />
          <ReadField label="Rationale" value={textValue(candidatePackage.subject.payload.rationale, "No rationale generated.")} />
        </RecordInspectorSection>

        <RecordInspectorSection showTitle title="Aliases" variant="single">
          <InlineList items={aliasItems(candidatePackage)} />
        </RecordInspectorSection>

        <RecordInspectorSection showTitle title="Claims" variant="single">
          <InlineList items={candidatePackage.claims.map((candidate) => textValue(candidate.payload.claimText, "Claim"))} />
        </RecordInspectorSection>

        <RecordInspectorSection showTitle title="Relationships" variant="single">
          <InlineList
            items={candidatePackage.relationships.map((candidate) =>
              `${textValue(candidate.payload.sourceLocalSubjectId, "source")} -> ${textValue(candidate.payload.targetLocalSubjectId, "target")}`
            )}
          />
        </RecordInspectorSection>

        <RecordInspectorSection showTitle title="Admission" variant="single">
          <div className="grid gap-2">
            <Button
              className="w-full justify-center"
              disabled={isBusy || !isPending}
              onClick={() => void onResolveSubject(candidatePackage.localSubjectId, "admit")}
              type="button"
            >
              <BadgeCheck />
              Admit
            </Button>
            <Select
              disabled={isBusy || !isPending}
              value={mergeTargetId ?? NO_MERGE_TARGET}
              onValueChange={(value) => setMergeTargetId(value === NO_MERGE_TARGET ? null : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Merge target" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NO_MERGE_TARGET}>No merge target</SelectItem>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id}>
                      {subject.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              className="w-full justify-center"
              disabled={isBusy || !isPending || !mergeTargetId}
              onClick={() => void onResolveSubject(candidatePackage.localSubjectId, "merge", mergeTargetId)}
              type="button"
              variant="outline"
            >
              <GitMerge />
              Merge
            </Button>
            <Button
              className="w-full justify-center"
              disabled={isBusy || !isPending}
              onClick={() => void onResolveSubject(candidatePackage.localSubjectId, "reject")}
              type="button"
              variant="destructive"
            >
              Reject
            </Button>
          </div>
        </RecordInspectorSection>
      </RecordInspectorContent>
    </RecordInspectorShell>
  );
}

function DomainContextInspector({
  activeDomain,
  domainContextModel,
  domainContextOutput,
  domainContextPrompt,
  domainContextRunError,
  domainContextStats,
  isBusy,
  onRefreshDomainContextOutput,
  onRunDomainContext,
  onSaveDomainContext
}: {
  activeDomain: DomainRecord | null;
  domainContextModel: string;
  domainContextOutput: string;
  domainContextPrompt: string;
  domainContextRunError: string | null;
  domainContextStats: DomainContextStats;
  isBusy: boolean;
  onRefreshDomainContextOutput: () => void;
  onRunDomainContext: (input: { model: string; prompt: string }) => void | Promise<void>;
  onSaveDomainContext: (profile: string) => void | Promise<void>;
}) {
  const hasSavedProfile = Boolean(activeDomain?.domain_context_profile);
  const hasGeneratedProfile = Boolean(activeDomain?.domain_context_last_run?.profile);

  return (
    <RecordInspectorShell>
      <RecordInspectorContent>
        <RecordInspectorHero
          action={<Badge variant="secondary">{hasSavedProfile ? "saved" : hasGeneratedProfile ? "generated" : "draft"}</Badge>}
          eyebrow="DOMAIN TOOL"
          title="Domain Context"
        />

        {domainContextRunError ? (
          <div className="pipeline-error">
            <AlertCircle />
            <span>{domainContextRunError}</span>
          </div>
        ) : null}

        <RecordInspectorSection showTitle title="Context Source" variant="single">
          <ReadField label="Model" value={domainContextModel} />
          {domainContextLines(activeDomain, domainContextStats).map((line) => (
            <ReadField key={line.label} label={line.label} value={line.value} />
          ))}
        </RecordInspectorSection>

        <RecordInspectorSection showTitle title="Actions" variant="single">
          <div className="grid gap-2">
            <Button
              className="w-full justify-center"
              disabled={!activeDomain || isBusy || !domainContextPrompt.trim()}
              onClick={() => void onRunDomainContext({ model: domainContextModel, prompt: domainContextPrompt })}
              type="button"
            >
              <Play />
              Run
            </Button>
            <Button
              className="w-full justify-center"
              disabled={!activeDomain || isBusy}
              onClick={onRefreshDomainContextOutput}
              type="button"
              variant="outline"
            >
              <RefreshCcw />
              Clear Output
            </Button>
            <Button
              className="w-full justify-center"
              disabled={!activeDomain || isBusy || !domainContextOutput.trim()}
              onClick={() => void onSaveDomainContext(domainContextOutput)}
              type="button"
              variant="outline"
            >
              <Save />
              Save Profile
            </Button>
          </div>
        </RecordInspectorSection>
      </RecordInspectorContent>
    </RecordInspectorShell>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return <RecordInspectorField label={label} value={value} wide />;
}

function InlineList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <RecordInspectorStub>None.</RecordInspectorStub>;
  }

  return (
    <RecordInspectorList>
      {items.map((item, index) => (
        <RecordInspectorListItem key={`${item}-${index}`} title={item} />
      ))}
    </RecordInspectorList>
  );
}

function aliasItems(candidatePackage: SubjectCandidatePackage) {
  return [
    ...arrayValue(candidatePackage.subject.payload.aliases),
    ...candidatePackage.aliases.map((candidate) => textValue(candidate.payload.alias, "Alias"))
  ];
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value.map((item) => textValue(item, "")).filter(Boolean) : [];
}

function textValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
