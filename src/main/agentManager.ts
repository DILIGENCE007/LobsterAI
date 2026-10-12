import { AgentSource } from '../shared/agent/constants';
import type { Agent, CoworkStore, CreateAgentRequest, UpdateAgentRequest } from './coworkStore';
import { PRESET_AGENTS, type PresetAgent, presetToCreateRequest } from './presetAgents';

/**
 * AgentManager handles CRUD operations for agents and preset agent installation.
 * Agents are stored in the SQLite `agents` table via CoworkStore.
 */
export class AgentManager {
  private store: CoworkStore;

  constructor(store: CoworkStore) {
    this.store = store;
  }

  listAgents(): Agent[] {
    return this.store.listAgents();
  }

  getAgent(agentId: string): Agent | null {
    return this.store.getAgent(agentId);
  }

  getDefaultAgent(): Agent {
    const agents = this.store.listAgents();
    return agents.find(a => a.isDefault) || agents[0];
  }

  createAgent(request: CreateAgentRequest, defaultModel?: string): Agent {
    return this.store.createAgent({
      ...request,
      model: request.model?.trim() || defaultModel?.trim() || '',
      workingDirectory: request.workingDirectory?.trim() || '',
    });
  }

  updateAgent(agentId: string, updates: UpdateAgentRequest): Agent | null {
    return this.store.updateAgent(agentId, {
      ...updates,
      ...(updates.workingDirectory !== undefined
        ? { workingDirectory: updates.workingDirectory.trim() }
        : {}),
    });
  }

  reorderAgents(agentIds: string[]): Agent[] {
    return this.store.reorderAgents(agentIds);
  }

  deleteAgent(agentId: string): boolean {
    return this.store.deleteAgent(agentId);
  }

  // --- Preset agents ---

  getPresetAgents(): PresetAgent[] {
    const existingAgents = this.store.listAgents();
    const existingPresetIds = new Set(
      existingAgents.filter(a => a.source === AgentSource.Preset).map(a => a.presetId)
    );
    // Only return presets that haven't been added yet
    return PRESET_AGENTS.filter(p => !existingPresetIds.has(p.id));
  }

  getAllPresetAgents(): PresetAgent[] {
    return PRESET_AGENTS;
  }

  addPresetAgent(presetId: string, defaultModel?: string): Agent | null {
    const preset = PRESET_AGENTS.find(p => p.id === presetId);
    if (!preset) return null;

    // Reuse the user's instance, including their edits. Summoning also re-enables it.
    const existing = this.store.listAgents().find(agent => agent.source === AgentSource.Preset && agent.presetId === preset.id);
    if (existing) {
      return existing.enabled ? existing : this.store.updateAgent(existing.id, { enabled: true });
    }

    return this.store.createAgent({
      ...presetToCreateRequest(preset),
      // A custom/imported agent may already own the legacy preset ID.
      id: this.store.getAgent(preset.id) ? undefined : preset.id,
      model: defaultModel?.trim() || '',
      workingDirectory: '',
    });
  }
}
