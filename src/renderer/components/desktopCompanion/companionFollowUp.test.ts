import { describe, expect, test, vi } from 'vitest';

import { CoworkSteerRejectReason, type CoworkSteerResponse, CoworkSteerStatus } from '../../../shared/cowork/steer';
import { CoworkSessionStatusValue } from '../../types/cowork';
import { submitCompanionFollowUp } from './companionFollowUp';

function client(status: string = CoworkSessionStatusValue.Completed) {
  return {
    getSession: vi.fn(async () => ({ success: true, session: { status } })),
    continueSession: vi.fn(async () => ({ success: true })),
    submitSteer: vi.fn(async (): Promise<CoworkSteerResponse> => ({
      success: true, status: CoworkSteerStatus.Accepted, clientSteerId: 'accepted',
    })),
  };
}

describe('companion task follow-up', () => {
  test('continues the selected completed task with its existing session settings', async () => {
    const api = client();
    expect(await submitCompanionFollowUp(api, 'selected-task', '  请举个例子  ')).toEqual({ success: true });
    expect(api.continueSession).toHaveBeenCalledExactlyOnceWith({ sessionId: 'selected-task', prompt: '请举个例子' });
    expect(api.submitSteer).not.toHaveBeenCalled();
  });

  test('adds input to a running task without starting a competing turn', async () => {
    const api = client(CoworkSessionStatusValue.Running);
    expect(await submitCompanionFollowUp(api, 'running-task', '补充说明')).toEqual({ success: true });
    expect(api.submitSteer).toHaveBeenCalledExactlyOnceWith({ sessionId: 'running-task', text: '补充说明', clientSteerId: expect.any(String) });
    expect(api.continueSession).not.toHaveBeenCalled();
  });

  test('continues normally if the active turn finishes while submitting', async () => {
    const api = client(CoworkSessionStatusValue.Running);
    api.getSession.mockResolvedValueOnce({ success: true, session: { status: CoworkSessionStatusValue.Running } })
      .mockResolvedValueOnce({ success: true, session: { status: CoworkSessionStatusValue.Completed } });
    api.submitSteer.mockResolvedValue({ success: false, status: CoworkSteerStatus.Rejected, clientSteerId: 'ended', reason: CoworkSteerRejectReason.NoActiveTurn });
    expect(await submitCompanionFollowUp(api, 'task', '继续')).toEqual({ success: true });
    expect(api.continueSession).toHaveBeenCalledExactlyOnceWith({ sessionId: 'task', prompt: '继续' });
  });

  test('does not retry a rejected input against a task that is still running', async () => {
    const api = client(CoworkSessionStatusValue.Running);
    api.submitSteer.mockResolvedValue({ success: false, status: CoworkSteerStatus.Rejected, clientSteerId: 'busy', reason: CoworkSteerRejectReason.NoActiveTurn, error: 'busy' });
    expect(await submitCompanionFollowUp(api, 'task', '继续')).toEqual({ success: false, error: 'busy' });
    expect(api.continueSession).not.toHaveBeenCalled();
  });

  test.each([CoworkSteerStatus.Pending, CoworkSteerStatus.Rejected])('does not clear or duplicate an unaccepted %s input', async status => {
    const api = client(CoworkSessionStatusValue.Running);
    api.submitSteer.mockResolvedValue({ success: true, status, clientSteerId: 'pending', error: 'not accepted' });
    expect(await submitCompanionFollowUp(api, 'task', '继续')).toEqual({ success: false, error: 'not accepted' });
    expect(api.continueSession).not.toHaveBeenCalled();
  });

  test('does not submit empty input or continue an unavailable session', async () => {
    const api = client();
    expect(await submitCompanionFollowUp(api, 'task', '  ')).toEqual({ success: false });
    expect(api.getSession).not.toHaveBeenCalled();
    api.getSession.mockResolvedValue({ success: false, session: { status: CoworkSessionStatusValue.Completed } });
    expect((await submitCompanionFollowUp(api, 'deleted', '继续')).success).toBe(false);
    expect(api.continueSession).not.toHaveBeenCalled();
    expect(api.submitSteer).not.toHaveBeenCalled();
  });
});
