import type { CodexModelOption } from "../types";

export const FALLBACK_WORKBENCH_MODEL_OPTIONS: CodexModelOption[] = [{
  description: "Default Codex model.",
  isDefault: true,
  label: "GPT-5.5",
  value: "gpt-5.5"
}];
export const DEFAULT_WORKBENCH_MODEL = FALLBACK_WORKBENCH_MODEL_OPTIONS[0].value;

export function normalizeWorkbenchModel(model: string | null | undefined, options: CodexModelOption[]): string {
  const modelOptions = options.length > 0 ? options : FALLBACK_WORKBENCH_MODEL_OPTIONS;

  return modelOptions.some((option) => option.value === model)
    ? String(model)
    : modelOptions.find((option) => option.isDefault)?.value ?? modelOptions[0].value ?? DEFAULT_WORKBENCH_MODEL;
}
