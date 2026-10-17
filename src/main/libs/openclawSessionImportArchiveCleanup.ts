import fs from 'fs';
import path from 'path';

import { removeTreeNoFollow } from './removeTreeNoFollow';

// Mirrors OpenClaw v2026.8.1 doctor-session-sqlite-migration-run.ts. The
// session→SQLite import moves legacy transcripts into
// `<sessions dir>/../session-sqlite-import-archive`; only the manual
// `doctor --session-sqlite restore|recover` modes read them back, and LobsterAI
// only ever runs `import`. Recheck when bumping OpenClaw.
const IMPORT_ARCHIVE_DIRECTORY = 'session-sqlite-import-archive';
const MIGRATION_RUNS_DIRECTORY = 'session-sqlite-migration-runs';
/** Import archives are removed this long after the last successful migration. */
export const OPENCLAW_SESSION_IMPORT_ARCHIVE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

interface MigrationManifest {
  startedAt?: unknown;
  completedAt?: unknown;
  failedAt?: unknown;
  failureReports?: unknown;
  targets?: unknown;
}

function parseTime(value: unknown): number {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Same rule as OpenClaw's isFailedSessionSqliteMigrationManifest(). */
function isCleanCompletion(manifest: MigrationManifest): boolean {
  if (manifest.completedAt === undefined || manifest.failedAt !== undefined || manifest.failureReports !== undefined) {
    return false;
  }
  if (!Array.isArray(manifest.targets)) return false;
  return manifest.targets.every((target: { issues?: unknown }) => Array.isArray(target?.issues) && target.issues.length === 0);
}

/**
 * Time of the newest migration run when it completed cleanly. Returns null
 * while the newest run is in flight, failed, or unreadable: `recover` may
 * still need the archive then.
 */
async function readLastCleanMigrationAt(stateDir: string): Promise<number | null> {
  const runsDir = path.join(stateDir, MIGRATION_RUNS_DIRECTORY);
  let names: string[];
  try {
    names = (await fs.promises.readdir(runsDir)).filter(name => name.endsWith('.json'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  let newest: { at: number; clean: boolean } | null = null;
  for (const name of names) {
    let manifest: MigrationManifest;
    try {
      manifest = JSON.parse(await fs.promises.readFile(path.join(runsDir, name), 'utf8')) as MigrationManifest;
    } catch {
      return null;
    }
    const at = parseTime(manifest.failedAt ?? manifest.completedAt ?? manifest.startedAt);
    if (!newest || at > newest.at) newest = { at, clean: isCleanCompletion(manifest) };
  }
  return newest?.clean && newest.at > 0 ? newest.at : null;
}

async function listImportArchives(stateDir: string): Promise<string[]> {
  const candidates = [path.join(stateDir, IMPORT_ARCHIVE_DIRECTORY)];
  try {
    for (const entry of await fs.promises.readdir(path.join(stateDir, 'agents'), { withFileTypes: true })) {
      if (entry.isDirectory()) candidates.push(path.join(stateDir, 'agents', entry.name, IMPORT_ARCHIVE_DIRECTORY));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const archives: string[] = [];
  for (const candidate of candidates) {
    try {
      if ((await fs.promises.lstat(candidate)).isDirectory()) archives.push(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return archives;
}

/**
 * Remove session import archives once the last migration run completed
 * cleanly more than the age limit ago. An archive modified within the limit
 * (a later import added files) is kept. Migration run manifests are left for
 * OpenClaw to prune. Best-effort: failures are logged and skipped. Returns the
 * removed archive directories.
 */
export async function pruneExpiredOpenClawSessionImportArchives(
  stateDir: string, options: { now?: number } = {},
): Promise<string[]> {
  const cutoff = (options.now ?? Date.now()) - OPENCLAW_SESSION_IMPORT_ARCHIVE_MAX_AGE_MS;
  const removed: string[] = [];
  try {
    const archives = await listImportArchives(stateDir);
    if (!archives.length) return removed;
    const lastCleanMigrationAt = await readLastCleanMigrationAt(stateDir);
    if (lastCleanMigrationAt === null || lastCleanMigrationAt > cutoff) return removed;
    for (const archive of archives) {
      try {
        if ((await fs.promises.lstat(archive)).mtimeMs > cutoff) continue;
        await removeTreeNoFollow(archive);
        removed.push(archive);
      } catch (error) {
        console.warn(`[OpenClaw] could not remove session import archive ${archive}:`, error);
      }
    }
  } catch (error) {
    console.warn('[OpenClaw] could not prune session import archives:', error);
  }
  return removed;
}
