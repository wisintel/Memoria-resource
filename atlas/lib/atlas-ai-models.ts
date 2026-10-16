export type AtlasChatProvider = "openai" | "anthropic" | "xai" | "zai";

export type AtlasChatEffort = "auto" | "minimal" | "low" | "medium" | "high";

export type AtlasChatModelOption = {
  effortOptions: AtlasChatEffort[];
  id: string;
  label: string;
  provider: AtlasChatProvider;
};

export type AtlasChatModelSettings = {
  effort: AtlasChatEffort;
  model: string;
  provider: AtlasChatProvider;
};

export type AtlasChatProviderOptions = Record<string, Record<string, string>>;

export const atlasChatProviders: { id: AtlasChatProvider; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "xai", label: "xAI" },
  { id: "zai", label: "Z.ai" },
];

export const atlasChatModelOptions: AtlasChatModelOption[] = [
  {
    effortOptions: ["auto", "minimal", "low", "medium", "high"],
    id: "openai/gpt-5.4",
    label: "GPT-5.4",
    provider: "openai",
  },
  {
    effortOptions: ["auto", "low", "medium", "high"],
    id: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
  },
  {
    effortOptions: ["auto"],
    id: "xai/grok-4.3",
    label: "Grok 4.3",
    provider: "xai",
  },
  {
    effortOptions: ["auto"],
    id: "zai/glm-5.2",
    label: "GLM-5.2",
    provider: "zai",
  },
];

export const defaultAtlasChatModelId = "xai/grok-4.3";
export const defaultAtlasDistillationModelId = "xai/grok-4.3";
export const defaultAtlasChatEffort: AtlasChatEffort = "auto";

export const atlasChatEffortLabels: Record<AtlasChatEffort, string> = {
  auto: "Auto",
  high: "High",
  low: "Low",
  medium: "Medium",
  minimal: "Minimal",
};

export function defaultAtlasChatModelSettings(): AtlasChatModelSettings {
  const model = atlasChatModelOptions.find((option) => option.id === defaultAtlasChatModelId) ?? atlasChatModelOptions[0];

  return {
    effort: defaultAtlasChatEffort,
    model: model.id,
    provider: model.provider,
  };
}

export function defaultAtlasDistillationModelSettings(): AtlasChatModelSettings {
  const model =
    atlasChatModelOptions.find((option) => option.id === defaultAtlasDistillationModelId) ??
    atlasChatModelOptions[0];

  return {
    effort: defaultAtlasChatEffort,
    model: model.id,
    provider: model.provider,
  };
}

export function findAtlasChatModelOption(modelId: string | null | undefined) {
  return atlasChatModelOptions.find((option) => option.id === modelId) ?? null;
}

export function isAtlasChatEffort(value: unknown): value is AtlasChatEffort {
  return value === "auto" || value === "minimal" || value === "low" || value === "medium" || value === "high";
}

export function providerOptionsForAtlasChatModel(
  model: AtlasChatModelOption,
  effort: AtlasChatEffort,
): AtlasChatProviderOptions | undefined {
  if (effort === "auto") {
    return undefined;
  }

  if (!model.effortOptions.includes(effort)) {
    return undefined;
  }

  if (model.provider === "openai") {
    return {
      openai: {
        reasoningEffort: effort,
      },
    };
  }

  if (model.provider === "anthropic") {
    return {
      anthropic: {
        effort,
      },
    };
  }

  return undefined;
}
