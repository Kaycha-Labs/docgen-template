/**
 * Kaycha DocGen — Diff Analyzer
 * Determines which canonical docs need updating based on changed files.
 */

import { DocType, DocWorkItem, DOC_META, DOC_TYPES } from './types.js';

/** Map of trigger patterns per doc type */
const TRIGGER_MAP: Record<DocType, (file: string) => boolean> = {
  readme: (f) =>
    /package\.json|\.env\.example|wrangler\.toml|netlify\.toml|README/i.test(f),

  product: (f) =>
    /src\/(pages|components|routes|contexts|views|screens)\//i.test(f),

  architecture: (f) =>
    /wrangler\.toml|netlify\.toml|supabase\/config|docker|\.toml$|infra\//i.test(f),

  engineering: (f) =>
    /package\.json|tsconfig|\.env\.example|vite\.config|pnpm-workspace|Makefile|justfile/i.test(f),

  security: (f) =>
    /supabase\/migrations|auth|rls|policy|secret|\.env|rbac|permission/i.test(f),

  api: (f) =>
    /supabase\/functions|src\/(routes|api|handlers|endpoints)\//i.test(f),

  data: (f) =>
    /supabase\/migrations\//i.test(f),

  operations: (f) =>
    /Dockerfile|docker-compose|wrangler\.toml|scripts\/|deploy|\.github\/workflows|Procfile/i.test(f),

  releases: (_f) =>
    true, // every push gets a release note entry

  'user-manual': (f) =>
    /src\/(pages|components|contexts|views|screens)\//i.test(f),
};

/** Files that indicate whitespace / non-source changes only */
const NOISE_PATTERNS = [
  /\.md$/i,             // other markdown (not our docs)
  /\.txt$/i,
  /\.log$/i,
  /\.lock$/i,           // lockfiles handled separately by deps-updater
  /\.gitignore$/i,
  /\.prettierrc/i,
  /\.eslintrc/i,
  /CHANGELOG/i,
  /LICENSE/i,
];

/**
 * Given a list of changed files, produce DocWorkItems for docs that need regeneration.
 */
export function analyzeChangedFiles(
  changedFiles: string[],
  repoName: string,
): DocWorkItem[] {
  // Filter out docgen's own output to avoid self-triggering
  const relevantFiles = changedFiles.filter(
    (f) => !f.startsWith('docs/') && !f.startsWith('docgen/') && f !== 'DEPS.yaml' && f !== 'CLAUDE.md',
  );

  if (relevantFiles.length === 0) {
    return [];
  }

  // Check if ALL changes are noise
  const hasSourceChanges = relevantFiles.some(
    (f) => !NOISE_PATTERNS.some((p) => p.test(f)),
  );

  const workItems: DocWorkItem[] = [];

  for (const docType of DOC_TYPES) {
    // releases always triggers (unless all noise)
    if (docType === 'releases' && !hasSourceChanges) continue;

    const triggerFiles = relevantFiles.filter(TRIGGER_MAP[docType]);

    if (triggerFiles.length > 0 || (docType === 'releases' && hasSourceChanges)) {
      const meta = DOC_META[docType];
      workItems.push({
        docType,
        outputPath: `docs/${repoName}__${meta.filename}`,
        triggerFiles: docType === 'releases' ? relevantFiles : triggerFiles,
      });
    }
  }

  return workItems;
}

/**
 * Check if any lockfile / package manifest was changed (triggers DEPS.yaml update).
 */
export function hasLockfileChanges(changedFiles: string[]): boolean {
  const lockPatterns = [
    /package\.json$/,
    /pnpm-lock\.yaml$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /requirements\.txt$/,
    /Pipfile\.lock$/,
    /go\.mod$/,
    /go\.sum$/,
    /Cargo\.lock$/,
    /Gemfile\.lock$/,
  ];
  return changedFiles.some((f) => lockPatterns.some((p) => p.test(f)));
}
