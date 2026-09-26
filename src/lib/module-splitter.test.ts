import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { splitIntoModules, collectSourceFiles, collectTestFiles } from '../lib/module-splitter';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpRepo(structure: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-gap-'));
  for (const [rel, content] of Object.entries(structure)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('splitIntoModules', () => {
  let tmpDir: string;

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns subdirs of src/ when src/ exists', () => {
    tmpDir = makeTmpRepo({
      'src/auth/login.ts': '',
      'src/payments/charge.ts': '',
    });
    const modules = splitIntoModules(tmpDir);
    expect(modules).toHaveLength(2);
    expect(modules.some((m) => m.endsWith('auth'))).toBe(true);
    expect(modules.some((m) => m.endsWith('payments'))).toBe(true);
  });

  it('falls back to repo root when no src/ directory', () => {
    tmpDir = makeTmpRepo({
      'lib/utils.ts': '',
      'lib/helpers.ts': '',
    });
    const modules = splitIntoModules(tmpDir);
    // no src/, so base is repoPath; only 'lib' is a subdir with .ts files
    expect(modules).toHaveLength(1);
    expect(modules[0]).toContain('lib');
  });

  it('excludes node_modules and .git', () => {
    tmpDir = makeTmpRepo({
      'src/core/index.ts': '',
      'src/node_modules/pkg/index.ts': '',
      'src/.git/config': '',
    });
    const modules = splitIntoModules(tmpDir);
    expect(modules).toHaveLength(1);
    expect(modules[0]).toContain('core');
  });

  it('returns the base dir itself for a flat repo with no subdirs', () => {
    tmpDir = makeTmpRepo({ 'index.ts': '' });
    const modules = splitIntoModules(tmpDir);
    expect(modules).toHaveLength(1);
  });
});

describe('collectSourceFiles', () => {
  let tmpDir: string;

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('collects .ts and .tsx files recursively', () => {
    tmpDir = makeTmpRepo({
      'src/a.ts': '',
      'src/b.tsx': '',
      'src/sub/c.ts': '',
      'src/readme.md': '',
    });
    const files = collectSourceFiles(path.join(tmpDir, 'src'));
    expect(files).toHaveLength(3);
  });
});

describe('collectTestFiles', () => {
  let tmpDir: string;

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('collects only .test.ts and .spec.ts files', () => {
    tmpDir = makeTmpRepo({
      'src/foo.ts': '',
      'src/foo.test.ts': '',
      'src/bar.spec.ts': '',
    });
    const tests = collectTestFiles(path.join(tmpDir, 'src'));
    expect(tests).toHaveLength(2);
  });
});
