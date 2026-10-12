import { ExpertCategory, PresetAgentId } from '@shared/agent/presets';
import { expect, test } from 'vitest';

import { EXPERT_SCENARIOS, filterExperts } from '../renderer/components/experts/catalog';
import { PRESET_AGENTS } from './presetAgents';

test('searches localized names, descriptions and tags together with category filters', () => {
  expect(filterExperts(PRESET_AGENTS, '  MINI app ', null, null).map(expert => expert.id)).toContain(PresetAgentId.MiniApp);
  expect(filterExperts(PRESET_AGENTS, '表格', ExpertCategory.Research, null).map(expert => expert.id)).toContain(PresetAgentId.Data);
  expect(filterExperts(PRESET_AGENTS, '表格', ExpertCategory.Life, null)).toHaveLength(0);
  expect(filterExperts(PRESET_AGENTS, '', null, '内容策划').length).toBeGreaterThan(1);
  expect(filterExperts(PRESET_AGENTS, 'no-matching-expert', null, null)).toEqual([]);
});

test('every featured expert is discoverable and has an example question', () => {
  for (const scenario of EXPERT_SCENARIOS) {
    for (const id of scenario.ids) {
      expect(PRESET_AGENTS.find(expert => expert.id === id)?.starterPrompts.length).toBeGreaterThan(0);
    }
  }
});
