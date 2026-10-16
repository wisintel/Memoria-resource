import { createSupabaseClient, type TableRow, type TableValue } from "./supabase-client";

export const defaultLimit = 25;
export const maxLimit = 100;

export function boundedLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) {
    return defaultLimit;
  }

  return Math.min(Math.max(Math.trunc(limit ?? defaultLimit), 1), maxLimit);
}

export function rowString(row: TableRow | null | undefined, key: string) {
  const value = row?.[key];

  return typeof value === "string" ? value : "";
}

export function rowStringArray(row: TableRow | null | undefined, key: string) {
  const value = row?.[key];

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function rowTitle(row: TableRow | null | undefined) {
  return (
    rowString(row, "label") ||
    rowString(row, "title") ||
    rowString(row, "name") ||
    rowString(row, "slug") ||
    rowString(row, "id")
  );
}

export function compactRows(rows: TableRow[], fields: string[]) {
  return rows.map((row) => compactRow(row, fields));
}

export function compactRow(row: TableRow, fields: string[]) {
  const compact: TableRow = {};

  for (const field of fields) {
    const value = row[field];

    if (value !== undefined) {
      compact[field] = value;
    }
  }

  return compact;
}

export async function classIdForTable(tableName: string) {
  const { data, error } = await createSupabaseClient()
    .from("classes")
    .select("id,table_name,label")
    .eq("table_name", tableName)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

export async function referenceLookups(domainId: string) {
  const supabase = createSupabaseClient();
  const [classesResult, typesResult, statusesResult, kindsResult] = await Promise.all([
    supabase.from("classes").select("id,label,table_name,type_id,purpose"),
    supabase.from("types").select("id,class_id,slug,label,status_id"),
    supabase.from("statuses").select("id,class_id,slug,label"),
    supabase.from("kinds").select("id,type_id,slug,label,status_id"),
  ]);

  const error =
    classesResult.error?.message ??
    typesResult.error?.message ??
    statusesResult.error?.message ??
    kindsResult.error?.message ??
    null;

  if (error) {
    throw new Error(error);
  }

  const classes = (classesResult.data ?? []) as unknown as TableRow[];
  const types = (typesResult.data ?? []) as unknown as TableRow[];
  const statuses = (statusesResult.data ?? []) as unknown as TableRow[];
  const kinds = (kindsResult.data ?? []) as unknown as TableRow[];
  const typeLabels = new Map(types.map((row) => [rowString(row, "id"), rowTitle(row)]));
  const classLabels = new Map(classes.map((row) => [rowString(row, "id"), rowTitle(row)]));
  const classTableNames = new Map(classes.map((row) => [rowString(row, "id"), rowString(row, "table_name")]));
  const statusLabels = new Map(statuses.map((row) => [rowString(row, "id"), rowTitle(row)]));
  const kindLabels = new Map(kinds.map((row) => [rowString(row, "id"), rowTitle(row)]));

  return {
    classLabels,
    classTableNames,
    classes: compactRows(classes, ["id", "label", "table_name", "purpose"]),
    domainId,
    kindLabels,
    kinds: compactRows(kinds, ["id", "type_id", "slug", "label"]),
    statusLabels,
    statuses: compactRows(statuses, ["id", "class_id", "slug", "label"]),
    typeLabels,
    types: compactRows(types, ["id", "class_id", "slug", "label"]),
  };
}

export function labelFor(lookup: Map<string, string>, value: TableValue | undefined) {
  return typeof value === "string" ? lookup.get(value) ?? value : "";
}
