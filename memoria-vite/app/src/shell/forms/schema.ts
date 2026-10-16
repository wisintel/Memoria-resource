import type { InspectorEditInput } from "@/lib/record-form";

type FieldInput = "text" | "textarea" | "select" | "reference";

export type FieldDef = {
  key: keyof InspectorEditInput;
  label: string;
  input: FieldInput;
  options?: "domains" | "types" | "role";
};

export const recordFormSchema: Partial<Record<string, FieldDef[]>> = {
  claims: [
    { key: "domainId", label: "Domain", input: "select", options: "domains" },
    { key: "type", label: "Type", input: "select", options: "types" },
    { key: "targetId", label: "Target", input: "reference" },
    { key: "claimText", label: "Text", input: "textarea" }
  ],
  documents: [
    { key: "label", label: "Name", input: "text" },
    { key: "domainId", label: "Domain", input: "select", options: "domains" },
    { key: "type", label: "Type", input: "select", options: "types" },
    { key: "description", label: "Description", input: "textarea" },
    { key: "aliases", label: "Aliases", input: "textarea" },
    { key: "source", label: "Source", input: "textarea" },
    { key: "intakeProfile", label: "Intake profile", input: "text" },
    { key: "extractionStage", label: "Extraction stage", input: "text" },
    { key: "sourceFilename", label: "Source filename", input: "text" },
    { key: "sourceUrl", label: "Source URL", input: "text" },
    { key: "mimeType", label: "MIME type", input: "text" }
  ],
  edges: [
    { key: "domainId", label: "Domain", input: "select", options: "domains" },
    { key: "type", label: "Type", input: "select", options: "types" },
    { key: "sourceId", label: "Source", input: "reference" },
    { key: "targetId", label: "Target", input: "reference" },
    { key: "source", label: "Provenance", input: "textarea" }
  ],
  nodes: [
    { key: "label", label: "Name", input: "text" },
    { key: "domainId", label: "Domain", input: "select", options: "domains" },
    { key: "type", label: "Type", input: "select", options: "types" },
    { key: "role", label: "Role", input: "select", options: "role" },
    { key: "lastUpdated", label: "Last updated", input: "text" },
    { key: "description", label: "Description", input: "textarea" },
    { key: "aliases", label: "Aliases", input: "textarea" },
    { key: "source", label: "Source", input: "textarea" }
  ]
};
