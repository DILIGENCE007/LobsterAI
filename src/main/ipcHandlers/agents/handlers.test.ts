import { ipcMain } from 'electron';
import { beforeEach, expect, test, vi } from 'vitest';

import { AgentIpcChannel } from '../../../shared/agent/constants';
import { ExpertFixtureId } from '../../../shared/agent/expertCatalogFixture';
import { type AgentHandlerDeps,registerAgentHandlers } from './handlers';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

function setup(syncOpenClawConfig: AgentHandlerDeps['syncOpenClawConfig'], agent: unknown = { id: ExpertFixtureId.Data }) {
  const addPresetAgent = vi.fn().mockReturnValue(agent);
  registerAgentHandlers({
    getAgentManager: () => ({ addPresetAgent }),
    resolveDefaultAgentModelRef: () => 'provider/model',
    syncOpenClawConfig,
  } as unknown as AgentHandlerDeps);
  const handler = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === AgentIpcChannel.AddPreset)![1];
  return { invoke: () => handler({} as Electron.IpcMainInvokeEvent, ExpertFixtureId.Data), addPresetAgent };
}

test('summon waits for OpenClaw synchronization before reporting success', async () => {
  let resolveSync!: (result: { success: boolean; changed: boolean }) => void;
  const sync = vi.fn(() => new Promise<{ success: boolean; changed: boolean }>(resolve => { resolveSync = resolve; }));
  const { invoke } = setup(sync);
  let settled = false;
  const result = invoke().then(value => { settled = true; return value; });
  await Promise.resolve();
  expect(settled).toBe(false);
  resolveSync({ success: true, changed: true });
  expect(await result).toEqual({ success: true, agent: { id: ExpertFixtureId.Data } });
});

test('sync failure is reported and a retry can finish preparation', async () => {
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  const sync = vi.fn().mockResolvedValueOnce({ success: false, changed: false, error: 'Gateway unavailable' })
    .mockResolvedValueOnce({ success: true, changed: true });
  const { invoke } = setup(sync);
  expect(await invoke()).toMatchObject({ success: false, error: 'Gateway unavailable' });
  expect(await invoke()).toMatchObject({ success: true });
  errorLog.mockRestore();
});

test('unknown presets do not trigger synchronization or claim success', async () => {
  const sync = vi.fn();
  const { invoke } = setup(sync, null);
  expect(await invoke()).toMatchObject({ success: false });
  expect(sync).not.toHaveBeenCalled();
});

test.each([
  [AgentIpcChannel.Presets, 'getPresetAgents'],
  [AgentIpcChannel.PresetTemplates, 'getAllPresetAgents'],
  [AgentIpcChannel.ExpertCatalog, 'getExpertCatalog'],
])('%s reports asynchronous catalog failures through IPC', async (channel, method) => {
  registerAgentHandlers({
    getAgentManager: () => ({ [method]: vi.fn().mockRejectedValue(new Error('Catalog unavailable')) }),
  } as unknown as AgentHandlerDeps);
  const handler = vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel)![1];
  expect(await handler({} as Electron.IpcMainInvokeEvent)).toEqual({ success: false, error: 'Catalog unavailable' });
});
