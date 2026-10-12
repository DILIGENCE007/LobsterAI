import { beforeEach, describe, expect, test } from 'vitest';

import { AgentSource } from '../shared/agent/constants';
import { PresetAgentId } from '../shared/agent/presets';
import { AgentManager } from './agentManager';
import type { Agent, CoworkStore, CreateAgentRequest, UpdateAgentRequest } from './coworkStore';
import { setLanguage } from './i18n';

const agents = new Map<string, Agent>();
const manager = new AgentManager({
  listAgents: () => [...agents.values()],
  getAgent: (id: string) => agents.get(id) ?? null,
  createAgent: (request: CreateAgentRequest) => {
    const agent = { ...request, id: request.id ?? 'generated-id', enabled: true } as Agent;
    agents.set(agent.id, agent);
    return agent;
  },
  updateAgent: (id: string, updates: UpdateAgentRequest) => {
    const agent = { ...agents.get(id), ...updates } as Agent;
    agents.set(id, agent);
    return agent;
  },
} as unknown as CoworkStore);

beforeEach(() => {
  agents.clear();
  setLanguage('zh');
});

describe('expert preset installation', () => {
  test('installs a localized agent with the default model and bundled capabilities', () => {
    setLanguage('en');
    const agent = manager.addPresetAgent(PresetAgentId.Data, ' provider/model ');
    expect(agent).toMatchObject({
      name: 'Data Insights Partner', model: 'provider/model', workingDirectory: '',
      source: AgentSource.Preset, presetId: PresetAgentId.Data, skillIds: ['xlsx', 'create-plan'],
    });
    expect(agent?.systemPrompt).toContain('Inspect actual data');
  });

  test('reuses an expert without resetting user edits and re-enables disabled instances', () => {
    const first = manager.addPresetAgent(PresetAgentId.Writer)!;
    manager.updateAgent(first.id, { name: '我的编辑', systemPrompt: 'Custom prompt', model: 'custom/model', skillIds: ['docx'], enabled: false });
    expect(manager.addPresetAgent(PresetAgentId.Writer, 'another/model')).toMatchObject({
      id: first.id, name: '我的编辑', systemPrompt: 'Custom prompt', model: 'custom/model', skillIds: ['docx'], enabled: true,
    });
    expect(agents.size).toBe(1);
  });

  test('does not commandeer an unrelated agent with the same ID', () => {
    const custom = { id: PresetAgentId.MiniApp, source: AgentSource.Custom, name: 'My own agent' } as Agent;
    agents.set(custom.id, custom);
    const expert = manager.addPresetAgent(PresetAgentId.MiniApp)!;
    expect(expert.id).not.toBe(custom.id);
    expect(manager.addPresetAgent(PresetAgentId.MiniApp)?.id).toBe(expert.id);
    expect(agents.get(custom.id)).toEqual(custom);
    expect(agents.size).toBe(2);
  });

  test('deleted experts can be summoned again and unknown IDs create nothing', () => {
    manager.addPresetAgent(PresetAgentId.Stock);
    agents.delete(PresetAgentId.Stock);
    expect(manager.addPresetAgent(PresetAgentId.Stock)?.presetId).toBe(PresetAgentId.Stock);
    expect(manager.addPresetAgent('missing-preset')).toBeNull();
    expect(agents.size).toBe(1);
  });
});
