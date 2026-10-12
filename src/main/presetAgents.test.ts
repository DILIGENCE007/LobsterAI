import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { ExpertCategory, PresetAgentId } from '../shared/agent/presets';
import { PRESET_AGENTS } from './presetAgents';

describe('expert catalog integrity', () => {
  test('retains legacy IDs and provides complete bilingual discovery and task instructions', () => {
    expect(new Set(PRESET_AGENTS.map(preset => preset.id)).size).toBe(PRESET_AGENTS.length);
    expect(PRESET_AGENTS.map(preset => preset.id)).toEqual(expect.arrayContaining(Object.values(PresetAgentId)));
    for (const preset of PRESET_AGENTS) {
      expect(Object.values(ExpertCategory)).toContain(preset.category);
      for (const value of [preset.name, preset.nameEn, preset.description, preset.descriptionEn, preset.identity, preset.identityEn, preset.systemPrompt, preset.systemPromptEn]) {
        expect(value.trim().length, preset.id).toBeGreaterThan(0);
      }
      expect(preset.tags.length, preset.id).toBeGreaterThan(0);
      expect(preset.starterPrompts.length, preset.id).toBeGreaterThanOrEqual(2);
      for (const value of [...preset.tags, ...preset.starterPrompts]) {
        expect(value.zh.trim().length, preset.id).toBeGreaterThan(0);
        expect(value.en.trim().length, preset.id).toBeGreaterThan(0);
      }
    }
  });

  test('every referenced capability ships with the application', () => {
    for (const preset of PRESET_AGENTS) {
      for (const id of preset.skillIds) {
        expect(existsSync(path.resolve('SKILLs', id, 'SKILL.md')), `${preset.id}: ${id}`).toBe(true);
      }
    }
  });

  test('all advertised categories contain distinct, ready-to-use experts', () => {
    for (const category of Object.values(ExpertCategory)) {
      expect(PRESET_AGENTS.some(preset => preset.category === category), category).toBe(true);
    }
    expect(new Set(PRESET_AGENTS.map(preset => preset.name)).size).toBe(PRESET_AGENTS.length);
    expect(new Set(PRESET_AGENTS.map(preset => preset.systemPrompt)).size).toBe(PRESET_AGENTS.length);
    for (const preset of PRESET_AGENTS) {
      expect(new Set(preset.starterPrompts.map(prompt => prompt.zh)).size, preset.id).toBe(preset.starterPrompts.length);
    }
  });
});
