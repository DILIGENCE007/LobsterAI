import { randomUUID } from 'crypto';

import { LogReporterAction } from '../../shared/analytics/constants';
import {
  catalogAnalyticsId,
  UsageAnalytics,
  type UsageContext,
  usageFailureCode,
  UsageOutcome,
  UsageStage,
} from '../../shared/analytics/usage';
import type { MainLogEventParams } from './mainLogReporter';

interface MediaJob {
  id: string;
  owner: string;
  context?: UsageContext;
  mediaType: string;
  startedAt: number;
  terminal: boolean;
  saved: boolean;
  accepted: boolean;
  confirmationStartedAt?: number;
  confirmationResolved?: boolean;
  modelId?: string;
  generatedSuccessfully?: boolean;
}

interface MediaResult {
  isError?: boolean;
  details?: Record<string, unknown>;
  content: Array<{ type: string; text: string }>;
}

export class MediaUsageAnalytics {
  private readonly jobs = new Map<string, MediaJob>();

  constructor(
    private readonly deps: {
      getOwner: () => string | null;
      context: (sessionId: string) => UsageContext | undefined;
      report: (event: MainLogEventParams) => void;
      now?: () => number;
    },
  ) {}

  async run<T extends MediaResult>(
    info: {
      sessionId: string | null;
      mediaType: string;
      action: string;
      taskId?: unknown;
      callId: string;
    },
    invoke: () => Promise<T>,
  ): Promise<T> {
    let job: MediaJob | undefined;
    this.safe(() => {
      const owner = this.deps.getOwner();
      if (owner === null) return;
      if (info.action === 'generate') {
        job = {
          id: randomUUID(),
          owner,
          context: info.sessionId ? this.deps.context(info.sessionId) : undefined,
          mediaType: info.mediaType,
          startedAt: this.now(),
          terminal: false,
          saved: false,
          accepted: false,
        };
        this.jobs.set(info.callId, job);
        this.trim();
        this.emit(job, UsageStage.Start, UsageOutcome.Started);
      } else if (typeof info.taskId === 'string') job = this.jobs.get(info.taskId);
    });
    try {
      const result = await invoke();
      this.safe(() => {
        if (!job) return;
        const details = result.details ?? {};
        const status = typeof details.status === 'string' ? details.status : '';
        if (info.action === 'generate') {
          if (result.isError) {
            const reason = [
              details.reason,
              ...(Array.isArray(details.warnings) ? details.warnings : []),
              ...result.content.map(item => item.text),
            ]
              .filter(item => typeof item === 'string')
              .join(' ');
            this.failure(job, reason, status);
            return;
          }
          if (!job.accepted) {
            job.accepted = true;
            this.emit(job, UsageStage.Accepted, UsageOutcome.Succeeded);
          }
          for (const alias of [details.taskId, details.upstreamTaskId]) {
            if (typeof alias === 'string') this.jobs.set(alias, job);
          }
          this.trim();
        }
        const assets = Array.isArray(details.assets) ? details.assets : [];
        this.terminal(job, status, assets.length);
        if (status === 'succeeded') {
          const saved = assets.filter(
            asset => asset && typeof asset === 'object' && 'filePath' in asset,
          ).length;
          this.persisted(job, saved, assets.length);
        }
      });
      return result;
    } catch (error) {
      this.safe(() => {
        if (job && info.action === 'generate') this.failure(job, error);
      });
      throw error;
    }
  }

  observe(taskId: string, status: string, count: number): void {
    this.safe(() => {
      const job = this.jobs.get(taskId);
      if (job) this.terminal(job, status, count);
    });
  }

  attribution(taskId: unknown): { context: UsageContext; mediaJobId: string } | undefined {
    try {
      const job = typeof taskId === 'string' ? this.jobs.get(taskId) : undefined;
      if (job?.context && job.owner === this.deps.getOwner()) return { context: job.context, mediaJobId: job.id };
    } catch { /* A missing attribution must not block delivery. */ }
    return undefined;
  }

  accept(callId: string, task: Record<string, unknown>): void {
    this.safe(() => {
      const job = this.jobs.get(callId);
      if (!job || job.accepted) return;
      job.accepted = true;
      job.modelId = catalogAnalyticsId(task.upstreamModel ?? task.model);
      this.emit(job, UsageStage.Accepted, UsageOutcome.Succeeded);
      for (const alias of [task.taskId, task.upstreamTaskId]) {
        if (typeof alias === 'string') this.jobs.set(alias, job);
      }
      this.trim();
      this.terminal(
        job,
        String(task.status),
        Array.isArray(task.resultUrls) ? task.resultUrls.length : 0,
      );
    });
  }

  confirmation(
    callId: string,
    outcome: typeof UsageOutcome.Requested | typeof UsageOutcome.Allowed | typeof UsageOutcome.Denied,
    modelId?: string,
  ): void {
    this.safe(() => {
      const job = this.jobs.get(callId);
      if (!job || job.owner !== this.deps.getOwner() || job.accepted || job.terminal) return;
      if (outcome === UsageOutcome.Requested) {
        if (job.confirmationStartedAt !== undefined) return;
        job.confirmationStartedAt = this.now();
        job.modelId = catalogAnalyticsId(modelId);
      } else {
        if (job.confirmationStartedAt === undefined || job.confirmationResolved) return;
        job.confirmationResolved = true;
      }
      this.emit(job, UsageStage.Confirmation, outcome, {
        durationMs: Math.max(0, this.now() - job.confirmationStartedAt),
      });
    });
  }

  save(taskId: string, savedCount: number, outputCount: number): void {
    this.safe(() => {
      const job = this.jobs.get(taskId);
      if (job) this.persisted(job, savedCount, outputCount);
    });
  }

  private terminal(job: MediaJob, status: string, outputCount: number): void {
    if (job.terminal || !['succeeded', 'failed', 'cancelled', 'timeout'].includes(status)) return;
    job.terminal = true;
    job.generatedSuccessfully = status === UsageOutcome.Succeeded;
    this.emit(
      job,
      UsageStage.Generated,
      status === 'succeeded'
        ? UsageOutcome.Succeeded
        : status === 'cancelled'
          ? UsageOutcome.Cancelled
          : status === 'timeout'
            ? UsageOutcome.Timeout
            : UsageOutcome.Failed,
      { outputCount },
    );
  }

  private persisted(job: MediaJob, savedCount: number, outputCount: number): void {
    if (job.saved) return;
    job.saved = true;
    this.emit(
      job,
      UsageStage.Saved,
      savedCount > 0 && savedCount === outputCount ? UsageOutcome.Succeeded : UsageOutcome.Failed,
      {
        savedCount,
        outputCount,
        partial: savedCount > 0 && savedCount < outputCount,
        failureCode:
          savedCount === outputCount && outputCount > 0 ? undefined : 'delivery_incomplete',
      },
    );
  }

  private emit(
    job: MediaJob,
    stage: UsageStage,
    outcome: UsageOutcome,
    fields: Record<string, string | number | boolean | undefined> = {},
  ): void {
    if (job.owner !== this.deps.getOwner()) return;
    this.deps.report({
      action: LogReporterAction.MediaLifecycle,
      schemaVersion: UsageAnalytics.SchemaVersion,
      ...job.context,
      mediaJobId: job.id,
      mediaType: job.mediaType,
      modelId: job.modelId,
      stage,
      outcome,
      durationMs: Math.max(0, this.now() - job.startedAt),
      ...fields,
    });
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private failure(job: MediaJob, error: unknown, status?: string): void {
    const stage = !job.accepted
      ? UsageStage.Accepted
      : job.generatedSuccessfully
        ? UsageStage.Saved
        : UsageStage.End;
    if (stage === UsageStage.Saved && job.saved) return;
    if (stage === UsageStage.Saved) job.saved = true;
    this.emit(
      job,
      stage,
      status === UsageOutcome.Cancelled ? UsageOutcome.Cancelled : UsageOutcome.Failed,
      { failureCode: usageFailureCode(error) },
    );
  }

  private trim(): void {
    while (this.jobs.size > UsageAnalytics.MaxTrackedItems)
      this.jobs.delete(this.jobs.keys().next().value!);
  }
  private safe(fn: () => void): void {
    try {
      fn();
    } catch {
      /* Telemetry is best effort. */
    }
  }
}
