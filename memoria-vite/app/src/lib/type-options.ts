import type { TypeRecord } from "../types";

export const claimTypeOptions = [
  "Definition",
  "Principle",
  "Classification",
  "Composition",
  "Causal",
  "Constraint",
  "Requirement",
  "Boundary",
  "Property",
  "State",
  "Identity",
  "Role",
  "Vocabulary",
  "Comparison",
  "Measurement",
  "Temporal"
];

export function typeOptionsForItemTable(types: TypeRecord[], itemTable: string, currentType: string) {
  const normalizedTable = itemTable === "relationships" ? "edges" : itemTable;
  const options = new Set<string>();

  for (const type of types) {
    if (type.item_table === normalizedTable && type.label.trim()) {
      options.add(type.label.trim());
    }
  }

  if (normalizedTable === "claims") {
    for (const type of claimTypeOptions) {
      options.add(type);
    }
  }

  if (currentType.trim()) {
    options.add(currentType.trim());
  }

  return [...options].sort((left, right) => left.localeCompare(right));
}
