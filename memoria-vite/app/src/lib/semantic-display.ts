const classColors: Record<string, string> = {
  clusters: "#ffb454",
  claims: "#b46cff",
  concepts: "#3f7cff",
  documents: "#1f9d68",
  domains: "#ff6b9d",
  edges: "#8aa0b8",
  entities: "#28b8a7",
  nodes: "#3f7cff",
  prompts: "#54c6ff",
  references: "#d5a44f",
  types: "#7f8cff"
};

const defaultItemColor = "#3f7cff";

export const defaultEdgeColor = "#8aa0b8";

export function itemColor(itemTable: string) {
  return classColors[itemTable] ?? defaultItemColor;
}

export function classLabel(itemTable: string) {
  const labels: Record<string, string> = {
    claims: "Claims",
    clusters: "Clusters",
    concepts: "Concepts",
    documents: "Documents",
    domains: "Domains",
    edges: "Edges",
    entities: "Entities",
    nodes: "Subjects",
    prompts: "Prompts",
    references: "References",
    types: "Types"
  };

  return labels[itemTable] ?? itemTable.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function edgeDisplayLabel(edge: {
  source_id: string | null;
  source_label?: string | null;
  target_id: string | null;
  target_label?: string | null;
}) {
  return `${edge.source_label ?? edge.source_id ?? "Unknown source"} -> ${edge.target_label ?? edge.target_id ?? "Unknown target"}`;
}
