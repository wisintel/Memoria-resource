import { createClient } from "@supabase/supabase-js";

export type TableValue =
  | string
  | number
  | boolean
  | null
  | TableValue[]
  | { [key: string]: TableValue };

export type TableRow = Record<string, TableValue | undefined>;

export function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}
