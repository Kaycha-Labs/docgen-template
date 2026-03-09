/**
 * Kaycha DocGen — Git Utilities
 * Handles diffing, committing, and pushing generated docs.
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';

const DOCGEN_BOT_NAME = 'Kaycha DocGen Bot';
const DOCGEN_BOT_EMAIL = 'docgen@kaychalabs.com';

/**
 * Configure git identity for docgen commits.
 */
export function configureGit(cwd: string): void {
  execSync(`git config user.name "${DOCGEN_BOT_NAME}"`, { cwd, stdio: 'pipe' });
  execSync(`git config user.email "${DOCGEN_BOT_EMAIL}"`, { cwd, stdio: 'pipe' });
}

/**
 * Get list of changed files between HEAD~1 and HEAD.
 * Falls back to listing all files if only one commit exists.
 */
export function getChangedFiles(cwd: string): string[] {
  try {
    const output = execSync('git diff HEAD~1 HEAD --name-only', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    // Single-commit repo or initial push — list all tracked files
    const output = execSync('git ls-files', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim().split('\n').filter(Boolean);
  }
}

/**
 * Get diff summary (--stat output) for prompt context.
 */
export function getDiffSummary(cwd: string): string {
  try {
    return execSync('git diff HEAD~1 HEAD --stat', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '(initial commit — no diff available)';
  }
}

/**
 * Check if docs/ directory exists and has .md files.
 * Uses Node readdirSync for cross-platform support (no shell ls).
 */
export function isFirstRun(repoRoot: string): boolean {
  const docsDir = `${repoRoot}/docs`;
  if (!existsSync(docsDir)) return true;
  try {
    const files = readdirSync(docsDir).filter((f) => f.endsWith('.md'));
    return files.length === 0;
  } catch {
    return true;
  }
}

/**
 * Commit and push all generated/updated files.
 */
export function commitAndPush(cwd: string, files: string[], triggerCommitMessage: string): void {
  if (files.length === 0) return;

  // Stage all doc files
  for (const file of files) {
    execSync(`git add "${file}"`, { cwd, stdio: 'pipe' });
  }

  // Check if there are actually staged changes
  try {
    execSync('git diff --cached --quiet', { cwd, stdio: 'pipe' });
    console.log('No changes to commit.');
    return;
  } catch {
    // There ARE staged changes — proceed with commit
  }

  // Build doc title list for commit message
  const docNames = files
    .map((f) => f.replace('docs/', '').replace(/^[^_]+__/, ''))
    .join(', ');

  const commitMsg = `[docgen] Update docs: ${docNames} — triggered by: "${truncate(triggerCommitMessage, 72)}"`;

  execSync(`git commit -m "${escapeShell(commitMsg)}"`, { cwd, stdio: 'pipe' });

  // Push using local git credentials
  const branch = execSync('git rev-parse --abbrev-ref HEAD', {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();

  // Pull rebase first to avoid "fetch first" rejections
  try {
    execSync(`git pull --rebase origin ${branch}`, { cwd, stdio: 'pipe' });
  } catch {
    // If pull fails (no upstream, etc.), just try pushing anyway
  }

  try {
    execSync(`git push origin HEAD:${branch}`, { cwd, stdio: 'pipe' });
    console.log(`Pushed docgen commit to ${branch}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ⚠ Push failed (docs committed locally): ${msg.split('\n')[0]}`);
  }
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen - 3) + '...' : s;
}

function escapeShell(s: string): string {
  return s.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
}
