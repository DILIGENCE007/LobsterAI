import { beforeEach, describe, expect, test, vi } from 'vitest';

import { AgentSource } from '../shared/agent/constants';
import { createExpertCatalogFixture, ExpertFixtureId } from '../shared/agent/expertCatalogFixture';
import { AgentManager } from './agentManager';
import type { Agent, CoworkStore, CreateAgentRequest, UpdateAgentRequest } from './coworkStore';
import { setLanguage } from './i18n';

const agents = new Map<string, Agent>();
const loadCatalog = vi.fn(async () => createExpertCatalogFixture());
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
} as unknown as CoworkStore, loadCatalog);

beforeEach(() => {
  agents.clear();
  loadCatalog.mockReset().mockImplementation(async () => createExpertCatalogFixture());
  setLanguage('zh');
});

describe('expert preset installation', () => {
  test('installs a localized agent with the default model and bundled capabilities', async () => {
    setLanguage('en');
    const agent = await manager.addPresetAgent(ExpertFixtureId.Data, ' provider/model ');
    expect(agent).toMatchObject({
      name: 'Test Data Partner', model: 'provider/model', workingDirectory: '',
      source: AgentSource.Preset, presetId: ExpertFixtureId.Data, skillIds: ['xlsx', 'create-plan'],
    });
    expect(agent?.systemPrompt).toContain('Inspect actual data');
  });

  test('reuses an expert offline without resetting user edits and re-enables disabled instances', async () => {
    const first = (await manager.addPresetAgent(ExpertFixtureId.Data))!;
    manager.updateAgent(first.id, { name: '我的编辑', systemPrompt: 'Custom prompt', model: 'custom/model', skillIds: ['docx'], enabled: false });
    loadCatalog.mockRejectedValue(new Error('Offline'));
    expect(await manager.addPresetAgent(ExpertFixtureId.Data, 'another/model')).toMatchObject({
      id: first.id, name: '我的编辑', systemPrompt: 'Custom prompt', model: 'custom/model', skillIds: ['docx'], enabled: true,
    });
    expect(agents.size).toBe(1);
  });

  test('does not commandeer an unrelated agent with the same ID', async () => {
    const custom = { id: ExpertFixtureId.App, source: AgentSource.Custom, name: 'My own agent' } as Agent;
    agents.set(custom.id, custom);
    const expert = (await manager.addPresetAgent(ExpertFixtureId.App))!;
    expect(expert.id).not.toBe(custom.id);
    expect((await manager.addPresetAgent(ExpertFixtureId.App))?.id).toBe(expert.id);
    expect(agents.get(custom.id)).toEqual(custom);
    expect(agents.size).toBe(2);
  });

  test('deleted experts can be summoned again and unknown IDs create nothing', async () => {
    await manager.addPresetAgent(ExpertFixtureId.Data);
    agents.delete(ExpertFixtureId.Data);
    expect((await manager.addPresetAgent(ExpertFixtureId.Data))?.presetId).toBe(ExpertFixtureId.Data);
    expect(await manager.addPresetAgent('missing-preset')).toBeNull();
    expect(agents.size).toBe(1);
  });

  test('concurrent summons share one installed agent', async () => {
    const results = await Promise.all([manager.addPresetAgent(ExpertFixtureId.Data), manager.addPresetAgent(ExpertFixtureId.Data)]);
    expect(results[0]?.id).toBe(results[1]?.id);
    expect(agents.size).toBe(1);
    expect((await manager.getPresetAgents()).map(preset => preset.id)).toEqual([ExpertFixtureId.App]);
  });
});
