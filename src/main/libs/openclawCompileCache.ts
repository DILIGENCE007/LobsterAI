import fs from 'fs';
import path from 'path';

import { removeTreeNoFollow } from './removeTreeNoFollow';

/**
 * NODE_COMPILE_CACHE writes into `<dir>/<version>-<arch>-<V8 flag hash>[-<uid>]`.
 * The gateway runs on this Electron's Node, so this prefix names its cache.
 */
export function getOpenClawCompileCachePrefix(version = process.version, arch: string = process.arch): string {
  return `${version}-${arch}-`;
}

/**
 * Remove compile cache subdirectories left by other Node/Electron versions.
 * Best-effort: failures are logged and skipped. Returns the removed paths.
 */
export async function pruneStaleOpenClawCompileCaches(
  compileCacheDir: string, currentPrefix = getOpenClawCompileCachePrefix(),
): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(compileCacheDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[OpenClaw] could not read compile cache dir ${compileCacheDir}:`, error);
    }
    return [];
  }
  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(currentPrefix)) continue;
    const target = path.join(compileCacheDir, entry.name);
    try {
      await removeTreeNoFollow(target);
      removed.push(target);
    } catch (error) {
      console.warn(`[OpenClaw] could not remove stale compile cache ${target}:`, error);
    }
  }
  return removed;
}
