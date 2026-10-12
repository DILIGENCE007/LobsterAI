import { AgentSource } from '@shared/agent/constants';
import { PresetAgentId } from '@shared/agent/presets';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { store } from '../store';
import { setAgents } from '../store/slices/agentSlice';
import {
  clearCurrentSession,
  setDraftAttachments,
  setDraftCollaborationMode,
  setDraftKitIds,
  setDraftPrompt,
  setDraftSkillIds,
  setSessions,
} from '../store/slices/coworkSlice';
import { setActiveKitIds } from '../store/slices/kitSlice';
import type { Agent } from '../types/agent';
import { CoworkCollaborationMode } from '../types/cowork';
import { agentService } from './agent';
import { openExpertDraft } from './expertOnboarding';

vi.mock('./cowork', () => ({
  coworkService: { clearSession: () => store.dispatch(clearCurrentSession()) },
}));

const expert: Agent = {
  id: 'expert-1', name: 'My edited expert', description: '', systemPrompt: 'My prompt', identity: '',
  model: 'provider/model', thinkingLevel: '', workingDirectory: '', icon: '', skillIds: ['docx'],
  subagentAllowAgentIds: [], enabled: true, pinned: false, isDefault: false, source: AgentSource.Preset,
  presetId: PresetAgentId.Writer, createdAt: 1, updatedAt: 1,
};

beforeEach(() => {
  store.dispatch(setAgents([]));
  vi.stubGlobal('window', { electron: { agents: { addPreset: vi.fn().mockResolvedValue(expert) } } });
});

afterEach(() => vi.unstubAllGlobals());

test('repeated preparation upserts the existing agent instead of duplicating it', async () => {
  await agentService.addPreset(expert.presetId);
  await agentService.addPreset(expert.presetId);
  expect(store.getState().agent.agents).toHaveLength(1);
  expect(store.getState().agent.agents[0]).toMatchObject({ name: expert.name, model: expert.model, skillIds: ['docx'] });
});

test('summon opens a clean expert draft without starting or stopping tasks', async () => {
  await agentService.addPreset(expert.presetId);
  const backgroundTask = { id: 'running-task', title: 'In progress', scheduledTaskId: null, status: 'running' as const, pinned: false, createdAt: 1, updatedAt: 1 };
  store.dispatch(setSessions([backgroundTask]));
  store.dispatch(setDraftPrompt({ sessionId: 'running-task', draft: 'Keep this task draft' }));
  store.dispatch(setDraftPrompt({ sessionId: '__home__', draft: 'An unrelated task' }));
  store.dispatch(setActiveKitIds(['previous-kit']));
  store.dispatch(setDraftKitIds({ draftKey: '__home__', kitIds: ['previous-kit'] }));
  store.dispatch(setDraftSkillIds({ draftKey: '__home__', skillIds: ['previous-skill'] }));
  store.dispatch(setDraftCollaborationMode({ draftKey: '__home__', mode: CoworkCollaborationMode.Plan }));
  store.dispatch(setDraftAttachments({ draftKey: '__home__', attachments: [{ name: 'old.txt', path: '/old.txt' }] }));

  openExpertDraft(expert, 'Help me edit an article');

  const state = store.getState();
  expect(state.agent.currentAgentId).toBe(expert.id);
  expect(state.cowork.currentSession).toBeNull();
  expect(state.cowork.sessions).toEqual([backgroundTask]);
  expect(state.cowork.draftPrompts['running-task']).toBe('Keep this task draft');
  expect(state.cowork.draftPrompts.__home__).toBe('Help me edit an article');
  expect(state.cowork.draftAttachments.__home__).toBeUndefined();
  expect(state.cowork.draftKitIds.__home__ ?? []).toEqual([]);
  expect(state.kit.activeKitIds).toEqual([]);
  expect(state.cowork.draftSkillIds.__home__).toEqual(expert.skillIds);
  expect(state.skill.activeSkillIds).toEqual(expert.skillIds);
  expect(state.cowork.draftCollaborationModes.__home__ ?? CoworkCollaborationMode.Default).toBe(CoworkCollaborationMode.Default);
});
