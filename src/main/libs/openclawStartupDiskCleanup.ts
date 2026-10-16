import { OPENCLAW_BROWSER_CACHE_PRUNE_INTERVAL_MS, pruneOpenClawBrowserCaches } from './openclawBrowserCachePrune';
import { pruneOpenClawRepairBackups } from './openclawCompatibilityRepair';
import { pruneStaleOpenClawCompileCaches } from './openclawCompileCache';
import { pruneOrphanOpenClawSessionStoreTemps } from './openclawSessionStoreTempCleanup';

const lastBrowserCachePruneAt = new Map<string, number>();

/**
 * Start best-effort disk cleanup for an OpenClaw profile before the gateway is
 * spawned. Every task runs in the background, logs its own failures, and never
 * touches state the starting gateway or a running browser uses.
 */
export function scheduleOpenClawStartupDiskCleanup(params: {
  baseDir: string; stateDir: string; compileCacheDir: string; now?: number;
}): void {
  const now = params.now ?? Date.now();
  // Node keeps one subdirectory per runtime version; earlier app versions leave theirs behind.
  void pruneStaleOpenClawCompileCaches(params.compileCacheDir).then((removed) => {
    if (removed.length) console.log(`[OpenClaw] removed ${removed.length} stale compile cache dir(s).`);
  });
  // Bound repair snapshots left by earlier versions without waiting for another repair.
  void pruneOpenClawRepairBackups(params.baseDir, { now }).then(({ removedRuns, strippedPaths }) => {
    if (removedRuns.length || strippedPaths.length) {
      console.log(`[OpenClawRepair] removed ${removedRuns.length} old repair backup(s); stripped ${strippedPaths.length} cache dir(s) from retained ones.`);
    }
  });
  void pruneOrphanOpenClawSessionStoreTemps(params.stateDir, { now }).then((removed) => {
    if (removed.length) console.log(`[OpenClaw] removed ${removed.length} orphan session store temp file(s).`);
  });
  // Measuring walks the cache trees, so this runs at most once per interval.
  if (now - (lastBrowserCachePruneAt.get(params.stateDir) ?? -Infinity) >= OPENCLAW_BROWSER_CACHE_PRUNE_INTERVAL_MS) {
    lastBrowserCachePruneAt.set(params.stateDir, now);
    void pruneOpenClawBrowserCaches(params.stateDir).then((removed) => {
      if (removed.length) console.log(`[OpenClaw] removed ${removed.length} oversized agent browser cache dir(s).`);
    });
  }
}
