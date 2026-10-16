import { afterEach, expect, test, vi } from 'vitest';

import { type CompanionAnalyticsEvent, CompanionAnalyticsOutcome, CompanionAnalyticsSource, CompanionAnalyticsStage } from '../../../shared/desktopCompanion/analytics';
import { beginCompanionTask } from './analytics';

afterEach(() => vi.unstubAllGlobals());

test('records the actual task submission result once, including follow-ups', () => {
  const reportAnalytics = vi.fn<(event: CompanionAnalyticsEvent) => Promise<void>>(async () => {});
  vi.stubGlobal('window', { electron: { desktopCompanion: { reportAnalytics } } });
  const finish = beginCompanionTask(CompanionAnalyticsSource.Result, true);
  finish(true);
  finish(false);
  expect(reportAnalytics.mock.calls.map(([event]) => event.stage)).toEqual([CompanionAnalyticsStage.Submit, CompanionAnalyticsStage.Result]);
  expect(reportAnalytics.mock.lastCall?.[0]).toMatchObject({ source: CompanionAnalyticsSource.Result,
    isFollowUp: true, outcome: CompanionAnalyticsOutcome.Success });
});

test('reporter IPC failure does not reject a task submission', async () => {
  vi.stubGlobal('window', { electron: { desktopCompanion: { reportAnalytics: () => Promise.reject(new Error('IPC closed')) } } });
  expect(() => beginCompanionTask(CompanionAnalyticsSource.Panel)(false)).not.toThrow();
  await Promise.resolve();
});
