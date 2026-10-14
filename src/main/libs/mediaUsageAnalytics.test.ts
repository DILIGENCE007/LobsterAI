import { expect, test, vi } from 'vitest';

import { UsageEntry, UsageOutcome, UsageStage } from '../../shared/analytics/usage';
import { MediaUsageAnalytics } from './mediaUsageAnalytics';

function setup() {
  const report = vi.fn();
  let owner: string | null = 'account-a:1';
  const tracker = new MediaUsageAnalytics({
    report,
    getOwner: () => owner,
    context: () => undefined,
  });
  return {
    tracker,
    report,
    setOwner: (value: string | null) => {
      owner = value;
    },
    events: () => report.mock.calls.map(call => call[0]),
  };
}
const request = {
  sessionId: 'private-session',
  mediaType: 'video',
  action: 'generate',
  callId: 'private-call',
};

test('async acceptance is not generation success; status and background polling share terminal deduplication', async () => {
  const s = setup();
  await s.tracker.run(request, async () => ({
    content: [],
    details: { taskId: 'private-task', upstreamTaskId: 'private-upstream', status: 'running' },
  }));
  expect(s.events().map(event => event.stage)).toEqual([UsageStage.Start, UsageStage.Accepted]);
  await s.tracker.run({ ...request, action: 'status', taskId: 'private-upstream' }, async () => ({
    content: [],
    details: { status: 'succeeded', assets: [{ filePath: 'D:/private/file.mp4' }] },
  }));
  s.tracker.observe('private-task', 'succeeded', 1);
  s.tracker.save('private-task', 1, 1);
  expect(s.events().map(event => event.stage)).toEqual([
    UsageStage.Start,
    UsageStage.Accepted,
    UsageStage.Generated,
    UsageStage.Saved,
  ]);
  expect(new Set(s.events().map(event => event.mediaJobId)).size).toBe(1);
  expect(JSON.stringify(s.events())).not.toContain('private');
});

test('generation success and partial local delivery have different outcomes', async () => {
  const s = setup();
  await s.tracker.run(request, async () => {
    s.tracker.accept(request.callId, {
      taskId: 'server-task',
      status: 'succeeded',
      resultUrls: ['a', 'b'],
    });
    s.tracker.save(request.callId, 1, 2);
    return {
      content: [],
      details: {
        taskId: 'server-task',
        status: 'succeeded',
        assets: [{ filePath: 'private-file' }],
      },
    };
  });
  expect(s.events().find(event => event.stage === UsageStage.Generated)).toMatchObject({
    outcome: UsageOutcome.Succeeded,
    outputCount: 2,
  });
  expect(s.events().filter(event => event.stage === UsageStage.Saved)).toEqual([
    expect.objectContaining({
      outcome: UsageOutcome.Failed,
      savedCount: 1,
      outputCount: 2,
      partial: true,
    }),
  ]);
});

test('account switching during an HTTP request never attributes the response to the new account', async () => {
  const s = setup();
  await s.tracker.run(request, async () => {
    s.setOwner('account-b:2');
    return { content: [], details: { status: 'succeeded' } };
  });
  expect(s.events()).toHaveLength(1);
});

test('rejections report a bounded reason instead of server text', async () => {
  const s = setup();
  await s.tracker.run(request, async () => ({
    isError: true,
    content: [{ type: 'text', text: 'Quota exhausted for private-user' }],
    details: { status: 'failed' },
  }));
  expect(s.events().at(-1)).toMatchObject({ outcome: UsageOutcome.Failed, failureCode: 'quota' });
  expect(JSON.stringify(s.events())).not.toContain('private-user');
});

test('disabled tracking does not change the tool result', async () => {
  const s = setup();
  s.setOwner(null);
  const result = { content: [] };
  expect(await s.tracker.run(request, async () => result)).toBe(result);
  expect(s.report).not.toHaveBeenCalled();
});

test('local persistence failure cannot turn an accepted request into a second acceptance outcome', async () => {
  const s = setup();
  await s.tracker.run(request, async () => {
    s.tracker.accept(request.callId, {
      taskId: 'server-task',
      status: 'succeeded',
      model: 'model-v1',
      resultUrls: ['private-url'],
    });
    return { isError: true, content: [{ type: 'text', text: 'Private filesystem error' }] };
  });
  expect(s.events().filter(event => event.stage === UsageStage.Accepted)).toHaveLength(1);
  expect(s.events().at(-1)).toMatchObject({
    stage: UsageStage.Saved,
    outcome: UsageOutcome.Failed,
    modelId: 'model-v1',
  });
});

test('delayed media delivery retains the original turn after a later conversation turn starts', async () => {
  const original = { taskId: 't', turnId: 'first', entry: UsageEntry.Direct };
  let current = original;
  const tracker = new MediaUsageAnalytics({ getOwner: () => 'a', context: () => current, report: vi.fn() });
  await tracker.run(request, async () => ({ content: [], details: { taskId: 'media-task', status: 'running' } }));
  current = { ...original, turnId: 'second' };
  expect(tracker.attribution('media-task')?.context).toBe(original);
});
