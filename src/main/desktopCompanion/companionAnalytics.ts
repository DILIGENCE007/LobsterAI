import {
  CompanionAnalyticsAction, type CompanionAnalyticsEvent, CompanionAnalyticsOutcome,
  CompanionAnalyticsSetting, CompanionAnalyticsSource, CompanionAnalyticsStage, normalizeCompanionAnalyticsEvent,
} from '../../shared/desktopCompanion/analytics';
import type { DesktopCompanionPreferences } from '../../shared/desktopCompanion/constants';
import type { MainLogEventParams } from '../libs/mainLogReporter';

export type CompanionAnalyticsReporter = (event: MainLogEventParams) => void | Promise<unknown>;

/** All auxiliary windows use the main reporter's current identity and opt-out. */
export class CompanionAnalytics {
  constructor(private readonly reporter?: CompanionAnalyticsReporter) {}

  report = (input: CompanionAnalyticsEvent): void => {
    const event = normalizeCompanionAnalyticsEvent(input);
    if (!event) return;
    try {
      void Promise.resolve(this.reporter?.({ ...event })).catch(() => {});
    } catch { /* Analytics must never interrupt a companion interaction. */ }
  };

  preferences(previous: DesktopCompanionPreferences, next: DesktopCompanionPreferences, source: CompanionAnalyticsSource): void {
    for (const setting of Object.values(CompanionAnalyticsSetting)) {
      if (JSON.stringify(previous[setting]) === JSON.stringify(next[setting])) continue;
      this.report({
        action: CompanionAnalyticsAction.SettingChanged, source, setting,
        ...(typeof next[setting] === 'boolean' ? { enabled: next[setting] as boolean } : {}),
        ...(setting === CompanionAnalyticsSetting.Shortcut ? { hasShortcut: !!next.shortcut } : {}),
        ...(setting === CompanionAnalyticsSetting.Skin ? { skin: next.skin } : {}),
        ...(setting === CompanionAnalyticsSetting.ExcludedApps ? { excludedAppCount: next.selectionExcludedApps.length } : {}),
      });
    }
  }

  tool(fields: Pick<CompanionAnalyticsEvent, 'source' | 'tool' | 'isFollowUp'>): (outcome: CompanionAnalyticsOutcome, reason?: CompanionAnalyticsEvent['reason']) => void {
    const startedAt = Date.now();
    let finished = false;
    this.report({ action: CompanionAnalyticsAction.Tool, ...fields, stage: CompanionAnalyticsStage.Submit });
    return (outcome, reason) => {
      if (finished) return;
      finished = true;
      this.report({ action: CompanionAnalyticsAction.Tool, ...fields, stage: CompanionAnalyticsStage.Result,
        outcome, reason, durationMs: Math.max(0, Date.now() - startedAt) });
    };
  }
}
