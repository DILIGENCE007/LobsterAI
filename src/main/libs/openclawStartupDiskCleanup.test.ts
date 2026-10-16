import { afterEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  compile: vi.fn(async () => [] as string[]),
  backups: vi.fn(async () => ({ removedRuns: [] as string[], strippedPaths: [] as string[] })),
  temps: vi.fn(async () => [] as string[]),
  browser: vi.fn(async () => [] as string[]),
}));
vi.mock('./openclawCompileCache', () => ({ pruneStaleOpenClawCompileCaches: mocks.compile }));
vi.mock('./openclawCompatibilityRepair', () => ({ pruneOpenClawRepairBackups: mocks.backups }));
vi.mock('./openclawSessionStoreTempCleanup', () => ({ pruneOrphanOpenClawSessionStoreTemps: mocks.temps }));
vi.mock('./openclawBrowserCachePrune', () => ({
  OPENCLAW_BROWSER_CACHE_PRUNE_INTERVAL_MS: 1000, pruneOpenClawBrowserCaches: mocks.browser,
}));

const { scheduleOpenClawStartupDiskCleanup } = await import('./openclawStartupDiskCleanup');

afterEach(() => vi.clearAllMocks());

test('every start runs the cheap prunes; the browser pass is throttled per state dir', () => {
  const params = { baseDir: '/base', stateDir: '/base/state', compileCacheDir: '/base/state/.compile-cache' };
  scheduleOpenClawStartupDiskCleanup({ ...params, now: 10_000 });
  scheduleOpenClawStartupDiskCleanup({ ...params, now: 10_500 });
  scheduleOpenClawStartupDiskCleanup({ ...params, stateDir: '/other/state', now: 10_500 });
  scheduleOpenClawStartupDiskCleanup({ ...params, now: 11_000 });

  expect(mocks.compile).toHaveBeenCalledTimes(4);
  expect(mocks.compile).toHaveBeenCalledWith(params.compileCacheDir);
  expect(mocks.backups).toHaveBeenCalledWith('/base', { now: 10_000 });
  expect(mocks.temps).toHaveBeenCalledWith('/base/state', { now: 10_000 });
  expect(mocks.browser.mock.calls).toEqual([['/base/state'], ['/other/state'], ['/base/state']]);
});
