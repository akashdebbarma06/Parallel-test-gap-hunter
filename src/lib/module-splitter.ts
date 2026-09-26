import * as fs from 'fs';
import * as path from 'path';

/** Max number of modules to surface — keeps subagent count predictable. */
const MAX_MODULES = 20;

/**
 * Split a repository into logical module directories.
 *
 * Strategy:
 *   1. Look for a `src/` directory at repo root; fall back to repo root itself.
 *   2. List immediate sub-directories that contain at least one .ts/.js file
 *      (direct or nested).
 *   3. If the count exceeds MAX_MODULES, merge the smallest (fewest source
 *      files) into a single synthetic "other" module.
 *   4. If no sub-directories exist, return the base directory itself as the
 *      single module.
 *
 * Returns absolute paths.
 */
export function splitIntoModules(repoPath: string): string[] {
  const srcDir = path.join(repoPath, 'src');
  const baseDir = fs.existsSync(srcDir) ? srcDir : repoPath;

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory() && !isIgnored(e.name))
    .map((e) => path.join(baseDir, e.name))
    .filter((d) => countSourceFiles(d) > 0);

  if (dirs.length === 0) {
    // Entire base is a single module (flat repo)
    return [baseDir];
  }

  if (dirs.length <= MAX_MODULES) {
    return dirs.sort();
  }

  // Too many modules — keep the top MAX_MODULES-1 by file count; merge the
  // rest into a virtual "other" entry represented as a comma-joined string.
  // For the subagent, we pass the individual file list separately, so the
  // path just needs to be identifiable.
  const ranked = [...dirs].sort(
    (a, b) => countSourceFiles(b) - countSourceFiles(a)
  );
  const kept = ranked.slice(0, MAX_MODULES - 1).sort();
  const merged = ranked.slice(MAX_MODULES - 1);
  // Represent the merged group as a virtual path
  const otherPath = path.join(baseDir, '__other__');
  // Attach merged paths as metadata by encoding in the path string
  // (phase2 splitter reads this back via getOtherPaths)
  (otherPath as unknown as { __merged: string[] }).__merged = merged;
  kept.push(otherPath);
  return kept;
}

/** Return the list of merged paths for the __other__ virtual module. */
export function getOtherPaths(otherPath: string): string[] | null {
  return (
    (otherPath as unknown as { __merged?: string[] }).__merged ?? null
  );
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.cache',
]);

function isIgnored(name: string): boolean {
  return name.startsWith('.') || IGNORED_DIRS.has(name);
}

/** Count .ts/.tsx/.js/.jsx files in a directory (recursive). */
export function countSourceFiles(dir: string): number {
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !isIgnored(e.name)) {
        count += countSourceFiles(path.join(dir, e.name));
      } else if (e.isFile() && /\.(tsx?|jsx?)$/.test(e.name)) {
        count++;
      }
    }
  } catch {
    // Unreadable dir — skip
  }
  return count;
}

/** Recursively collect source file paths under a directory. */
export function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && !isIgnored(e.name)) {
        files.push(...collectSourceFiles(full));
      } else if (e.isFile() && /\.(tsx?|jsx?)$/.test(e.name)) {
        files.push(full);
      }
    }
  } catch {
    // skip
  }
  return files;
}

/** Collect test files (*.test.ts, *.spec.ts, etc.) under a directory. */
export function collectTestFiles(dir: string): string[] {
  return collectSourceFiles(dir).filter((f) =>
    /\.(test|spec)\.(tsx?|jsx?)$/.test(f)
  );
}
