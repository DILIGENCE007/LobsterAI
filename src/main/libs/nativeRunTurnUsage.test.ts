import { beforeEach, describe, expect, test } from 'vitest';

import { isValidLlmTraceId } from '../../shared/cowork/llmTurnUsage';
import { clearLlmUsageContexts, registerLlmUsageContext } from './llmUsageContext';
import {
  claimNativeRunTurnUsage,
  clearNativeRunTurnUsage,
  recordNativeRunLlmTrace,
  recordNativeRunMediaTask,
} from './nativeRunTurnUsage';

const TRACE_A = '4bf92f3577b34da6a3ce929d0e0e4736';
const TRACE_B = '11112222333344445555666677778888';

describe('nativeRunTurnUsage', () => {
  beforeEach(() => {
    clearNativeRunTurnUsage();
    clearLlmUsageContexts();
  });

  test('claims the traces of a run once, the earliest run first', () => {
    expect(recordNativeRunLlmTrace({ runId: 'run-2', traceId: TRACE_B }, 2_000)).toBe(true);
    expect(recordNativeRunLlmTrace({ runId: 'run-1', traceId: TRACE_A }, 1_000)).toBe(true);
    expect(recordNativeRunLlmTrace({ runId: 'run-1', traceId: TRACE_A }, 1_500)).toBe(true);

    expect(claimNativeRunTurnUsage(['run-1', 'run-2', 'unknown'])).toEqual({
      trace: { traceId: TRACE_A, startedAt: 1_000, relatedTraceIds: [TRACE_B] },
      mediaTaskIds: [],
    });
    expect(claimNativeRunTurnUsage(['run-1', 'run-2'])).toBeNull();
  });

  test('ignores invalid reports and traces of desktop turns', () => {
    registerLlmUsageContext(TRACE_A, 'desktop-session', 'hello');

    expect(recordNativeRunLlmTrace({ runId: 'run-1', traceId: TRACE_A })).toBe(false);
    expect(recordNativeRunLlmTrace({ runId: 'run-1', traceId: 'not-a-trace' })).toBe(false);
    expect(recordNativeRunLlmTrace({ runId: '', traceId: TRACE_B })).toBe(false);
    expect(recordNativeRunLlmTrace({ runId: 42, traceId: TRACE_B })).toBe(false);
    expect(claimNativeRunTurnUsage(['run-1'])).toBeNull();
  });

  test('keeps the preset a run resolved with the model it resolved to', () => {
    recordNativeRunLlmTrace({ runId: 'run-1', traceId: TRACE_A, model: 'deepseek-flash-YoudaoInner', virtualModelId: 'yd-fast' }, 1);
    recordNativeRunLlmTrace({ runId: 'run-1', traceId: TRACE_B, model: 'glm-5', virtualModelId: 'yd-ultra' }, 2);
    recordNativeRunLlmTrace({ runId: 'run-2', traceId: TRACE_A, model: 'yd-fast', virtualModelId: 'yd-fast' }, 3);
    recordNativeRunLlmTrace({ runId: 'run-3', traceId: TRACE_B, model: 'glm-5' }, 4);

    expect(claimNativeRunTurnUsage(['run-1'])?.modelPreset)
      .toEqual({ modelPresetId: 'balanced', resolvedModelId: 'deepseek-flash-YoudaoInner' });
    expect(claimNativeRunTurnUsage(['run-2'])?.modelPreset).toBeUndefined();
    expect(claimNativeRunTurnUsage(['run-3'])?.modelPreset).toBeUndefined();
  });

  test('keeps media tasks and gives a media-only run its own lookup trace', () => {
    recordNativeRunMediaTask('run-1', 42, 3_000);
    recordNativeRunMediaTask('run-1', '42', 3_100);
    recordNativeRunMediaTask('run-1', 'abc', 3_200);

    const usage = claimNativeRunTurnUsage(['run-1']);

    expect(usage?.mediaTaskIds).toEqual(['42']);
    expect(usage?.trace.startedAt).toBe(3_000);
    expect(isValidLlmTraceId(usage?.trace.traceId)).toBe(true);
    expect(usage?.trace.relatedTraceIds).toBeUndefined();
  });

  test('drops the least recently used runs beyond the limit', () => {
    recordNativeRunLlmTrace({ runId: 'oldest', traceId: TRACE_A }, 1);
    for (let index = 0; index < 256; index += 1) {
      recordNativeRunLlmTrace({ runId: `run-${index}`, traceId: TRACE_B }, 2);
    }

    expect(claimNativeRunTurnUsage(['oldest'])).toBeNull();
    expect(claimNativeRunTurnUsage(['run-255'])?.trace.traceId).toBe(TRACE_B);
  });
});
