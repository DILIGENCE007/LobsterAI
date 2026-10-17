import { ApiFormat, OpenAIApiMode, ProviderAuthType, ProviderName } from './constants';

const CUSTOM_PROVIDER_KEY_PATTERN = /^custom_[0-9]+$/;

/**
 * Built-in providers whose OpenAI-compatible endpoint serves `/responses` and
 * whose OpenClaw provider plugin leaves Responses payloads alone. Before adding
 * one, check that its plugin's stream wrappers gate on `openai-completions`
 * (DeepSeek V4 and Xiaomi MiMo thinking wrappers currently do not) and that no
 * LobsterAI runtime profile requires Chat Completions (Moonshot Kimi K3).
 */
const RESPONSES_CAPABLE_BUILTIN_PROVIDERS: ReadonlySet<string> = new Set([
  ProviderName.OpenRouter,
  ProviderName.Volcengine,
  ProviderName.Minimax,
  ProviderName.LmStudio,
]);

type OpenAIApiModeContext = {
  apiFormat?: unknown;
  openaiApiMode?: unknown;
  codingPlanEnabled?: unknown;
  authType?: unknown;
};

/** Whether this provider can ever offer the Chat Completions / Responses choice. */
export const supportsOpenAIApiModeSelection = (providerName: string): boolean => (
  CUSTOM_PROVIDER_KEY_PATTERN.test(providerName)
  || RESPONSES_CAPABLE_BUILTIN_PROVIDERS.has(providerName)
);

/**
 * Whether the choice applies to the provider's current setup. Coding plan and
 * OAuth routes use dedicated endpoints with no Responses support.
 */
export const isOpenAIApiModeAvailable = (
  providerName: string,
  config: Pick<OpenAIApiModeContext, 'codingPlanEnabled' | 'authType'> | undefined,
): boolean => (
  supportsOpenAIApiModeSelection(providerName)
  && config?.codingPlanEnabled !== true
  && config?.authType !== ProviderAuthType.OAuth
);

export const normalizeOpenAIApiMode = (value: unknown): OpenAIApiMode => (
  value === OpenAIApiMode.Responses ? OpenAIApiMode.Responses : OpenAIApiMode.ChatCompletions
);

/**
 * Resolve the OpenAI endpoint family a provider should use. Returns undefined
 * when the provider is not OpenAI-compatible or the choice does not apply, so
 * callers keep their existing per-provider defaults.
 */
export const resolveProviderOpenAIApiMode = (
  providerName: string,
  config: OpenAIApiModeContext | undefined,
): OpenAIApiMode | undefined => {
  if (!config || config.apiFormat !== ApiFormat.OpenAI) return undefined;
  if (!isOpenAIApiModeAvailable(providerName, config)) return undefined;
  return normalizeOpenAIApiMode(config.openaiApiMode);
};
