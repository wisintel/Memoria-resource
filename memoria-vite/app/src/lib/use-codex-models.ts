import { useQuery } from "@tanstack/react-query";
import { loadCodexModels } from "@/api";
import { queryKeys } from "@/lib/query-keys";

export function useCodexModels() {
  return useQuery({ queryKey: queryKeys.codexModels(), queryFn: loadCodexModels });
}
