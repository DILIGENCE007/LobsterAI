import { OPENCLAW_BROWSER_CACHE_PRUNE_INTERVAL_MS, pruneOpenClawBrowserCaches } from './openclawBrowserCachePrune';
import { pruneOpenClawRepairBackups } from './openclawCompatibilityRepair';
import { pruneStaleOpenClawCompileCaches } from './openclawCompileCache';
import { pruneExpiredOpenClawSessionImportArchives } from './openclawSessionImportArchiveCleanup';
import { pruneOrphanOpenClawSessionStoreTemps } from './openclawSessionStoreTempCleanup';

/**
 * Delay after the gateway reports ready. The first pass after an upgrade can
 * delete hundreds of thousands of files; it must not compete with startup I/O.
 */
export const OPENCLAW_STARTUP_DISK_CLEANUP_DELAY_MS = 60_000;

export interface OpenClawStartupDiskCleanupParams {
  baseDir: string;
  stateDir: string;
  compileCacheDir: string;
}

const lastBrowserCachePruneAt = new Map<string, number>();
// State dirs with a pass pending or running; gateway restarts reuse that pass.
const activeCleanups = new Set<string>();

async function runStep(label: string, step: () => Promise<string | null>): Promise<void> {
  try {
    const summary = await step();
    if (summary) console.log(summary);
  } catch (error) {
    console.warn(`[OpenClaw] disk cleanup step "${label}" failed:`, error);
  }
}

/**
 * Best-effort disk cleanup for an OpenClaw profile. Steps run one at a time to
 * keep the I/O load low, log their own failures, and never touch state the
 * running gateway or a running browser uses.
 */
export async function runOpenClawStartupDiskCleanup(
  params: OpenClawStartupDiskCleanupParams, now = Date.now(),
): Promise<void> {
  // Node keeps one subdirectory per runtime version; earlier app versions leave theirs behind.
  await runStep('compile cache', async () => {
    const removed = await pruneStaleOpenClawCompileCaches(params.compileCacheDir);
    return removed.length ? `[OpenClaw] removed ${removed.length} stale compile cache dir(s).` : null;
  });
  // Bound repair snapshots left by earlier versions without waiting for another repair.
  await runStep('repair backups', async () => {
    const { removedRuns, strippedPaths } = await pruneOpenClawRepairBackups(params.baseDir, { now });
    return removedRuns.length || strippedPaths.length
      ? `[OpenClawRepair] removed ${removedRuns.length} old repair backup(s); stripped ${strippedPaths.length} cache dir(s) from retained ones.`
      : null;
  });
  await runStep('session store temps', async () => {
    const removed = await pruneOrphanOpenClawSessionStoreTemps(params.stateDir, { now });
    return removed.length ? `[OpenClaw] removed ${removed.length} orphan session store temp file(s).` : null;
  });
  await runStep('session import archives', async () => {
    const removed = await pruneExpiredOpenClawSessionImportArchives(params.stateDir, { now });
    return removed.length ? `[OpenClaw] removed ${removed.length} expired session import archive(s).` : null;
  });
  // Measuring walks the cache trees, so this runs at most once per interval.
  if (now - (lastBrowserCachePruneAt.get(params.stateDir) ?? -Infinity) >= OPENCLAW_BROWSER_CACHE_PRUNE_INTERVAL_MS) {
    lastBrowserCachePruneAt.set(params.stateDir, now);
    await runStep('browser caches', async () => {
      const removed = await pruneOpenClawBrowserCaches(params.stateDir);
      return removed.length ? `[OpenClaw] removed ${removed.length} oversized agent browser cache dir(s).` : null;
    });
  }
}

/**
 * Run the cleanup in the background a while after the gateway is ready. At
 * most one pass per state dir is pending or running at a time.
 */
export function scheduleOpenClawStartupDiskCleanup(
  params: OpenClawStartupDiskCleanupParams, delayMs = OPENCLAW_STARTUP_DISK_CLEANUP_DELAY_MS,
): void {
  if (activeCleanups.has(params.stateDir)) return;
  activeCleanups.add(params.stateDir);
  const timer = setTimeout(() => {
    void runOpenClawStartupDiskCleanup(params).finally(() => activeCleanups.delete(params.stateDir));
  }, delayMs);
  // Never keep the app alive just to clean up.
  timer.unref?.();
}
