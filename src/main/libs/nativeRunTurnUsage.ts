import { type CoworkLlmTrace, isValidLlmTraceId } from '../../shared/cowork/llmTurnUsage';
import { type ModelPresetId, parseModelPresetModelId } from '../../shared/modelPresets/constants';
import { createLlmTraceId } from './llmTrace';
import { hasLlmUsageContext } from './llmUsageContext';

/**
 * Package-model traces and media tasks of runs that OpenClaw starts itself
 * (IM messages, cron jobs). The client did not start these turns, so the
 * model-routing plugin reports each run's traces, and the run's user message
 * is bound to them when the turn ends.
 */
const MAX_RUNS = 256;
const MAX_RUN_ID_LENGTH = 128;

/** The virtual preset model (快速/旗舰) a run used, as the desktop stamps on its messages. */
export type NativeRunModelPreset = {
  modelPresetId: ModelPresetId;
  resolvedModelId: string;
};

type NativeRunUsage = {
  traceIds: string[];
  mediaTaskIds: string[];
  startedAt: number;
  modelPreset?: NativeRunModelPreset;
};

export type NativeRunTurnUsage = {
  trace: CoworkLlmTrace;
  mediaTaskIds: string[];
  modelPreset?: NativeRunModelPreset;
};

export type NativeRunLlmTraceReport = {
  runId: unknown;
  traceId: unknown;
  /** Model the call was sent to; the resolved model when the run used a preset. */
  model?: unknown;
  /** Virtual model (yd-fast/yd-ultra) the run resolved, if any. */
  virtualModelId?: unknown;
};

const runs = new Map<string, NativeRunUsage>();

const isRunId = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_RUN_ID_LENGTH
);

// Entries are re-inserted on every write, so map order is least recently used first.
const touchRun = (runId: string, now: number): NativeRunUsage => {
  const run = runs.get(runId) ?? { traceIds: [], mediaTaskIds: [], startedAt: now };
  runs.delete(runId);
  runs.set(runId, run);
  while (runs.size > MAX_RUNS) runs.delete(runs.keys().next().value!);
  return run;
};

export function recordNativeRunLlmTrace(report: NativeRunLlmTraceReport, now = Date.now()): boolean {
  const { runId, traceId } = report;
  if (!isRunId(runId) || !isValidLlmTraceId(traceId)) return false;
  // Desktop turns already store the trace they sent with chat.send.
  if (hasLlmUsageContext(traceId)) return false;
  const run = touchRun(runId, now);
  if (!run.traceIds.includes(traceId)) run.traceIds.push(traceId);
  const modelPresetId = parseModelPresetModelId(report.virtualModelId);
  const resolvedModelId = typeof report.model === 'string' ? report.model.trim() : '';
  if (!run.modelPreset && modelPresetId && resolvedModelId && !parseModelPresetModelId(resolvedModelId)) {
    run.modelPreset = { modelPresetId, resolvedModelId };
  }
  return true;
}

export function recordNativeRunMediaTask(runId: unknown, taskId: unknown, now = Date.now()): void {
  const id = String(taskId ?? '');
  if (!isRunId(runId) || !/^[1-9]\d*$/.test(id)) return;
  const run = touchRun(runId, now);
  if (!run.mediaTaskIds.includes(id)) run.mediaTaskIds.push(id);
}

/** Removes the usage recorded for the turn's runs; null when none of them reported any. */
export function claimNativeRunTurnUsage(runIds: Iterable<string>): NativeRunTurnUsage | null {
  const claimed: NativeRunUsage[] = [];
  for (const runId of new Set(runIds)) {
    const run = runs.get(runId);
    if (!run) continue;
    runs.delete(runId);
    claimed.push(run);
  }
  if (claimed.length === 0) return null;
  claimed.sort((left, right) => left.startedAt - right.startedAt);
  // A media-only run has no ledger rows; its trace only keys the media task lookup.
  const [traceId = createLlmTraceId(), ...relatedTraceIds] = [...new Set(claimed.flatMap(run => run.traceIds))];
  const modelPreset = claimed.find(run => run.modelPreset)?.modelPreset;
  return {
    trace: {
      traceId,
      startedAt: claimed[0].startedAt,
      ...(relatedTraceIds.length > 0 ? { relatedTraceIds } : {}),
    },
    mediaTaskIds: [...new Set(claimed.flatMap(run => run.mediaTaskIds))],
    ...(modelPreset ? { modelPreset } : {}),
  };
}

export function clearNativeRunTurnUsage(): void {
  runs.clear();
}
