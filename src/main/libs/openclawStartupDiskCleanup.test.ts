import { afterEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  compile: vi.fn(async () => [] as string[]),
  backups: vi.fn(async () => ({ removedRuns: [] as string[], strippedPaths: [] as string[] })),
  temps: vi.fn(async () => [] as string[]),
  archives: vi.fn(async () => [] as string[]),
  browser: vi.fn(async () => [] as string[]),
}));
vi.mock('./openclawCompileCache', () => ({ pruneStaleOpenClawCompileCaches: mocks.compile }));
vi.mock('./openclawCompatibilityRepair', () => ({ pruneOpenClawRepairBackups: mocks.backups }));
vi.mock('./openclawSessionStoreTempCleanup', () => ({ pruneOrphanOpenClawSessionStoreTemps: mocks.temps }));
vi.mock('./openclawSessionImportArchiveCleanup', () => ({ pruneExpiredOpenClawSessionImportArchives: mocks.archives }));
vi.mock('./openclawBrowserCachePrune', () => ({
  OPENCLAW_BROWSER_CACHE_PRUNE_INTERVAL_MS: 1000, pruneOpenClawBrowserCaches: mocks.browser,
}));

const {
  OPENCLAW_STARTUP_DISK_CLEANUP_DELAY_MS, runOpenClawStartupDiskCleanup, scheduleOpenClawStartupDiskCleanup,
} = await import('./openclawStartupDiskCleanup');

const params = { baseDir: '/base', stateDir: '/base/state', compileCacheDir: '/base/state/.compile-cache' };

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

test('a pass runs every prune one at a time and throttles the browser pass per state dir', async () => {
  let active = 0;
  let maxActive = 0;
  for (const mock of [mocks.compile, mocks.temps, mocks.archives, mocks.browser]) {
    mock.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return [];
    });
  }

  await runOpenClawStartupDiskCleanup(params, 10_000);
  await runOpenClawStartupDiskCleanup(params, 10_500);
  await runOpenClawStartupDiskCleanup({ ...params, stateDir: '/other/state' }, 10_500);
  await runOpenClawStartupDiskCleanup(params, 11_000);

  expect(maxActive).toBe(1);
  expect(mocks.compile).toHaveBeenCalledTimes(4);
  expect(mocks.compile).toHaveBeenCalledWith(params.compileCacheDir);
  expect(mocks.backups).toHaveBeenCalledWith('/base', { now: 10_000 });
  expect(mocks.temps).toHaveBeenCalledWith('/base/state', { now: 10_000 });
  expect(mocks.archives).toHaveBeenCalledWith('/base/state', { now: 10_000 });
  expect(mocks.browser.mock.calls).toEqual([['/base/state'], ['/other/state'], ['/base/state']]);
});

test('a failing step does not stop the remaining steps', async () => {
  mocks.compile.mockRejectedValueOnce(new Error('boom'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  await runOpenClawStartupDiskCleanup({ ...params, stateDir: '/failing/state' }, 50_000);

  expect(warn).toHaveBeenCalledWith(expect.stringContaining('compile cache'), expect.any(Error));
  expect(mocks.archives).toHaveBeenCalledTimes(1);
  expect(mocks.browser).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

test('scheduling waits for the delay and coalesces restarts into one pending pass', async () => {
  vi.useFakeTimers();
  const scheduled = { ...params, stateDir: '/scheduled/state' };

  scheduleOpenClawStartupDiskCleanup(scheduled);
  scheduleOpenClawStartupDiskCleanup(scheduled);
  await vi.advanceTimersByTimeAsync(OPENCLAW_STARTUP_DISK_CLEANUP_DELAY_MS - 1);
  expect(mocks.compile).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.compile).toHaveBeenCalledTimes(1);
  expect(mocks.archives).toHaveBeenCalledTimes(1);

  // Once the pass finishes, the next gateway start schedules a new one.
  scheduleOpenClawStartupDiskCleanup(scheduled);
  await vi.advanceTimersByTimeAsync(OPENCLAW_STARTUP_DISK_CLEANUP_DELAY_MS);
  expect(mocks.compile).toHaveBeenCalledTimes(2);
});
