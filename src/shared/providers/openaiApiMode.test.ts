import { describe, expect, test } from 'vitest';

import { ApiFormat, OpenAIApiMode, ProviderAuthType, ProviderName } from './constants';
import {
  isOpenAIApiModeAvailable,
  normalizeOpenAIApiMode,
  resolveProviderOpenAIApiMode,
  supportsOpenAIApiModeSelection,
} from './openaiApiMode';

describe('OpenAI API mode', () => {
  test('is selectable for custom providers and the reviewed built-in providers', () => {
    for (const provider of [
      'custom_0',
      'custom_12',
      ProviderName.OpenRouter,
      ProviderName.Volcengine,
      ProviderName.Minimax,
      ProviderName.LmStudio,
    ]) {
      expect(supportsOpenAIApiModeSelection(provider)).toBe(true);
    }
    for (const provider of [
      ProviderName.Custom,
      ProviderName.OpenAI,
      ProviderName.DeepSeek,
      ProviderName.Xiaomi,
      ProviderName.Qwen,
      ProviderName.Moonshot,
      ProviderName.Zhipu,
      ProviderName.Qianfan,
      ProviderName.StepFun,
      ProviderName.Ollama,
      ProviderName.Copilot,
    ]) {
      expect(supportsOpenAIApiModeSelection(provider)).toBe(false);
    }
  });

  test('is unavailable on coding plan and OAuth routes', () => {
    expect(isOpenAIApiModeAvailable(ProviderName.Volcengine, {})).toBe(true);
    expect(isOpenAIApiModeAvailable(ProviderName.Volcengine, { codingPlanEnabled: true })).toBe(false);
    expect(isOpenAIApiModeAvailable(ProviderName.Minimax, { authType: ProviderAuthType.OAuth })).toBe(false);
    expect(isOpenAIApiModeAvailable(ProviderName.Minimax, { authType: ProviderAuthType.ApiKey })).toBe(true);
  });

  test('normalizes unknown values to Chat Completions', () => {
    expect(normalizeOpenAIApiMode(OpenAIApiMode.Responses)).toBe(OpenAIApiMode.Responses);
    expect(normalizeOpenAIApiMode(undefined)).toBe(OpenAIApiMode.ChatCompletions);
    expect(normalizeOpenAIApiMode('websocket')).toBe(OpenAIApiMode.ChatCompletions);
  });

  test('resolves only for OpenAI-compatible providers where the choice applies', () => {
    const responses = { apiFormat: ApiFormat.OpenAI, openaiApiMode: OpenAIApiMode.Responses };
    expect(resolveProviderOpenAIApiMode('custom_0', responses)).toBe(OpenAIApiMode.Responses);
    expect(resolveProviderOpenAIApiMode(ProviderName.OpenRouter, responses)).toBe(OpenAIApiMode.Responses);
    expect(resolveProviderOpenAIApiMode('custom_0', { apiFormat: ApiFormat.OpenAI }))
      .toBe(OpenAIApiMode.ChatCompletions);
    expect(resolveProviderOpenAIApiMode('custom_0', { ...responses, apiFormat: ApiFormat.Anthropic }))
      .toBeUndefined();
    expect(resolveProviderOpenAIApiMode(ProviderName.DeepSeek, responses)).toBeUndefined();
    expect(resolveProviderOpenAIApiMode(ProviderName.Volcengine, { ...responses, codingPlanEnabled: true }))
      .toBeUndefined();
    expect(resolveProviderOpenAIApiMode('custom_0', undefined)).toBeUndefined();
  });
});
