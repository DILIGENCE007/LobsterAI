import {
  CompanionAnalyticsAction, type CompanionAnalyticsEvent, CompanionAnalyticsOutcome,
  type CompanionAnalyticsSource, CompanionAnalyticsStage,
} from '../../../shared/desktopCompanion/analytics';

/** Auxiliary surfaces do not initialize the main renderer's analytics identity. */
export function reportCompanionAnalytics(event: CompanionAnalyticsEvent): void {
  try {
    void window.electron.desktopCompanion.reportAnalytics(event).catch(() => {});
  } catch { /* Reporting must not affect task submission or file drops. */ }
}

export function beginCompanionTask(source: CompanionAnalyticsSource, isFollowUp = false): (success: boolean) => void {
  const startedAt = Date.now();
  let finished = false;
  reportCompanionAnalytics({ action: CompanionAnalyticsAction.Task, source, isFollowUp, stage: CompanionAnalyticsStage.Submit });
  return success => {
    if (finished) return;
    finished = true;
    reportCompanionAnalytics({ action: CompanionAnalyticsAction.Task, source, isFollowUp, stage: CompanionAnalyticsStage.Result,
      outcome: success ? CompanionAnalyticsOutcome.Success : CompanionAnalyticsOutcome.Failed,
      durationMs: Math.max(0, Date.now() - startedAt) });
  };
}
