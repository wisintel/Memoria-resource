import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LabEffortOption, LabModelOption } from "@/domain/runs";

type CodexCachedModel = {
  default_reasoning_level?: unknown;
  display_name?: unknown;
  priority?: unknown;
  slug?: unknown;
  supported_reasoning_levels?: unknown;
  visibility?: unknown;
};

type CodexModelsCache = {
  models?: unknown;
};

const codexModelPrefix = "codex:";
const gatewayModelPrefix = "gateway:";
const fallbackGatewayModel = "anthropic/claude-sonnet-4-6";
const grok45GatewayModel = "xai/grok-4.5";

const autoEffortOption = {
  description: "Use the provider default",
  label: "Auto",
  value: "auto",
} satisfies LabEffortOption;

const gatewayFallbackOption = {
  defaultEffort: "auto",
  effortOptions: [autoEffortOption],
  label: "Claude Sonnet 4.6 (AI Gateway fallback)",
  provider: "gateway",
  value: `${gatewayModelPrefix}${fallbackGatewayModel}`,
} satisfies LabModelOption;

const grok45GatewayOption = {
  defaultEffort: "auto",
  effortOptions: [autoEffortOption],
  label: "Grok 4.5",
  provider: "gateway",
  value: `${gatewayModelPrefix}${grok45GatewayModel}`,
} satisfies LabModelOption;

export function isCodexModelId(modelId: string) {
  return modelId.startsWith(codexModelPrefix);
}

export function isGatewayModelId(modelId: string) {
  return modelId.startsWith(gatewayModelPrefix);
}

export function toRuntimeModelId(modelId: string) {
  if (isCodexModelId(modelId)) {
    return modelId.slice(codexModelPrefix.length);
  }

  if (isGatewayModelId(modelId)) {
    return modelId.slice(gatewayModelPrefix.length);
  }

  return modelId;
}

export async function getExtractionModelCatalog(): Promise<{
  defaultModel: string;
  modelOptions: LabModelOption[];
}> {
  const codexOptions = await loadCodexModelOptions();
  const modelOptions = [
    ...codexOptions,
    grok45GatewayOption,
    gatewayFallbackOption,
  ];

  return {
    defaultModel: modelOptions[0]?.value ?? gatewayFallbackOption.value,
    modelOptions,
  };
}

async function loadCodexModelOptions() {
  try {
    const cache = JSON.parse(
      await readFile(join(homedir(), ".codex", "models_cache.json"), "utf8")
    ) as CodexModelsCache;
    const models = Array.isArray(cache.models) ? cache.models : [];

    return [...models]
      .sort((left, right) => modelPriority(left) - modelPriority(right))
      .map(toCodexModelOption)
      .filter((option): option is LabModelOption => option !== null);
  } catch {
    return [];
  }
}

function toCodexModelOption(model: unknown): LabModelOption | null {
  if (!isRecord(model)) {
    return null;
  }

  const cachedModel = model as CodexCachedModel;
  const slug = stringOrNull(cachedModel.slug);

  if (!slug || cachedModel.visibility !== "list") {
    return null;
  }

  const supportedLevels = Array.isArray(cachedModel.supported_reasoning_levels)
    ? cachedModel.supported_reasoning_levels
        .map(toEffortOption)
        .filter((option): option is LabEffortOption => option !== null)
    : [];
  const defaultEffort = stringOrNull(cachedModel.default_reasoning_level);
  const effortOptions = [autoEffortOption, ...supportedLevels];
  return {
    defaultEffort:
      defaultEffort && effortOptions.some((option) => option.value === defaultEffort)
        ? defaultEffort
        : "auto",
    effortOptions,
    label: stringOrNull(cachedModel.display_name) ?? slug,
    provider: "codex",
    value: `${codexModelPrefix}${slug}`,
  };
}

function modelPriority(value: unknown) {
  if (!isRecord(value)) {
    return 1000;
  }

  return typeof value.priority === "number" ? value.priority : 1000;
}

function toEffortOption(value: unknown): LabEffortOption | null {
  if (!isRecord(value)) {
    return null;
  }

  const effort = stringOrNull(value.effort);

  if (!effort) {
    return null;
  }

  return {
    description: stringOrNull(value.description) ?? undefined,
    label: labelFromEffort(effort),
    value: effort,
  };
}

function labelFromEffort(effort: string) {
  if (effort === "xhigh") {
    return "Extra High";
  }

  return effort.slice(0, 1).toUpperCase() + effort.slice(1);
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
