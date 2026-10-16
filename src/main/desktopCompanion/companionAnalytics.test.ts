import { describe, expect, test, vi } from 'vitest';

import { LogReporterAction, LogReporterStoreKey } from '../../shared/analytics/constants';
import {
  CompanionAnalyticsAction as Action, CompanionAnalyticsOutcome as Outcome, CompanionAnalyticsSetting as Setting,
  CompanionAnalyticsSource as Source, CompanionAnalyticsStage as Stage, CompanionAnalyticsTool as Tool,
  normalizeCompanionAnalyticsEvent,
} from '../../shared/desktopCompanion/analytics';
import { DEFAULT_DESKTOP_COMPANION_PREFERENCES } from '../../shared/desktopCompanion/constants';
import { CompanionFileKind } from '../../shared/desktopCompanion/fileKinds';
import { MainLogReporter } from '../libs/mainLogReporter';
import { CompanionAnalytics } from './companionAnalytics';

describe('companion analytics privacy and reporting', () => {
  test('drops business data, unknown enum values, invalid numbers and non-companion events', () => {
    expect(normalizeCompanionAnalyticsEvent({ action: Action.FileDrop, source: Source.FileDrop,
      prompt: 'private selection', text: 'private answer', path: '/Users/private/document.pdf',
      sessionId: 'local-session', requestId: 'upstream-id', appId: 'private.application',
      skin: '/private/skin.png', reason: 'HTTP error containing secrets', durationMs: Infinity,
      attachmentCount: -1, fileKinds: [CompanionFileKind.Pdf, '/private/document.pdf', CompanionFileKind.Pdf].join(','),
    })).toEqual({ action: Action.FileDrop, source: Source.FileDrop, fileKinds: CompanionFileKind.Pdf });
    expect(normalizeCompanionAnalyticsEvent({ action: LogReporterAction.AppStarted, source: Source.Panel })).toBeNull();
    expect(normalizeCompanionAnalyticsEvent({ action: Action.Task, source: '/private/path' })).toBeNull();
  });

  test('reports only actual preference changes without shortcut or excluded application identifiers', () => {
    const report = vi.fn();
    const analytics = new CompanionAnalytics(report);
    const previous = DEFAULT_DESKTOP_COMPANION_PREFERENCES;
    analytics.preferences(previous, { ...previous }, Source.Settings);
    expect(report).not.toHaveBeenCalled();
    analytics.preferences(previous, { ...previous, enabled: true, shortcut: '', selectionExcludedApps: ['Secret App'] }, Source.Settings);
    expect(report.mock.calls.map(([event]) => event)).toEqual([
      { action: Action.SettingChanged, source: Source.Settings, setting: Setting.Enabled, enabled: true },
      { action: Action.SettingChanged, source: Source.Settings, setting: Setting.Shortcut, hasShortcut: false },
      { action: Action.SettingChanged, source: Source.Settings, setting: Setting.ExcludedApps, excludedAppCount: 1 },
    ]);
  });

  test('finishes a tool once even if cancellation and a late completion race', () => {
    const report = vi.fn();
    const finish = new CompanionAnalytics(report).tool({ source: Source.Selection, tool: Tool.Explain });
    finish(Outcome.Cancelled);
    finish(Outcome.Success);
    expect(report.mock.calls.map(([event]) => event.stage)).toEqual([Stage.Submit, Stage.Result]);
    expect(report.mock.lastCall?.[0]).toMatchObject({ outcome: Outcome.Cancelled, durationMs: expect.any(Number) });
  });

  test('uses the current main-process opt-out and login state for every auxiliary-window event', async () => {
    let enabled = false;
    let yid = 'first-account';
    const fetch = vi.fn<(url: string, signal: AbortSignal) => Promise<{ ok: boolean; status: number }>>(async () => ({ ok: true, status: 200 }));
    const reporter = new MainLogReporter({ appVersion: 'test', fetch, store: {
      get: <T>(key: string): T | undefined => ({
        [LogReporterStoreKey.AppConfig]: { usageAnalyticsEnabled: enabled },
        [LogReporterStoreKey.AuthUser]: { yid },
        [LogReporterStoreKey.InstallationUuid]: 'installation',
      }[key] as T | undefined),
      set: vi.fn(),
    } });
    const analytics = new CompanionAnalytics(event => reporter.report(event));
    const event = { action: Action.Task, source: Source.Panel, stage: Stage.Submit };
    analytics.report(event);
    expect(fetch).not.toHaveBeenCalled();
    enabled = true;
    analytics.report(event);
    yid = 'second-account';
    analytics.report(event);
    enabled = false;
    analytics.report(event);
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map(([url]) => new URL(url).searchParams.get('log_Usid'))).toEqual(['first-account', 'second-account']);
  });

  test('isolates both synchronous and asynchronous reporter failures', async () => {
    for (const report of [() => { throw new Error('offline'); }, () => Promise.reject(new Error('offline'))]) {
      const analytics = new CompanionAnalytics(report);
      expect(() => analytics.report({ action: Action.Task, source: Source.Panel })).not.toThrow();
    }
    await Promise.resolve();
  });
});
