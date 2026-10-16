import type { TableValue } from "@/lib/supabase/client";

export type ReferenceLabels = Record<string, string>;

export function formatTableValue(
  value: TableValue | undefined,
  fieldName?: string,
  referenceLabels: ReferenceLabels = {},
) {
  if (value === undefined || value === null) {
    return "null";
  }

  if (typeof value === "string" && fieldName?.endsWith("_id")) {
    return referenceLabels[value] ?? value;
  }

  if (Array.isArray(value) && fieldName?.endsWith("_ids")) {
    return value
      .map((item) => (typeof item === "string" ? referenceLabels[item] ?? item : JSON.stringify(item)))
      .join(", ");
  }

  if (
    typeof value === "number" &&
    (fieldName === "created_at" || fieldName === "updated_at" || fieldName?.endsWith("_at"))
  ) {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  if (typeof value === "string") {
    return value.length > 96 ? `${value.slice(0, 96)}...` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}
