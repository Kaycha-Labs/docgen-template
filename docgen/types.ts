/**
 * Kaycha DocGen — Type definitions
 * Canonical document types sourced from canonical_docs table (Supabase project qtzoqewqktteszulzajz)
 */

export const DOC_TYPES = [
  'readme',
  'product',
  'architecture',
  'engineering',
  'security',
  'api',
  'data',
  'operations',
  'releases',
  'user-manual',
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export const DOC_META: Record<DocType, { id: number; title: string; filename: string }> = {
  readme:       { id: 1,  title: 'System Overview',          filename: 'README.md' },
  product:      { id: 2,  title: 'Product & Features',       filename: 'PRODUCT.md' },
  architecture: { id: 3,  title: 'System Architecture',      filename: 'ARCHITECTURE.md' },
  engineering:  { id: 4,  title: 'Developer Guide',           filename: 'ENGINEERING.md' },
  security:     { id: 5,  title: 'Security & Compliance',     filename: 'SECURITY.md' },
  api:          { id: 6,  title: 'API Reference',             filename: 'API.md' },
  data:         { id: 7,  title: 'Data Model',                filename: 'DATA.md' },
  operations:   { id: 8,  title: 'Operations & Runbooks',     filename: 'OPERATIONS.md' },
  releases:     { id: 9,  title: 'Release Notes',             filename: 'RELEASES.md' },
  'user-manual':{ id: 10, title: 'User Manual',               filename: 'USER-MANUAL.md' },
};

/** Which model to use per doc type */
export const DOC_MODEL: Record<DocType, string> = {
  readme:       'claude-opus-4-20250514',
  product:      'claude-opus-4-20250514',
  architecture: 'claude-opus-4-20250514',
  engineering:  'claude-opus-4-20250514',
  security:     'claude-opus-4-20250514',
  api:          'claude-opus-4-20250514',
  data:         'claude-opus-4-20250514',
  operations:   'claude-opus-4-20250514',
  releases:     'claude-haiku-4-5-20251001',
  'user-manual':'claude-opus-4-20250514',
};

export interface DocWorkItem {
  docType: DocType;
  outputPath: string;       // e.g. "docs/kaycha-crm__README.md"
  triggerFiles: string[];   // which changed files triggered this doc
}

export interface PromptContext {
  docType: DocType;
  docTitle: string;
  repoName: string;
  existingContent: string;
  changedFiles: string[];
  diffSummary: string;
  sourceContext: string;
  commitMessage: string;
  commitAuthor: string;
  commitDate: string;
}

export interface RunLogEntry {
  timestamp: string;
  repo: string;
  branch: string;
  commitSha: string;
  commitMessage: string;
  docsGenerated: string[];
  depsUpdated: boolean;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  error?: string;
}

export interface DepsYaml {
  meta: {
    repo: string;
    generated_at: string;
    generator: string;
  };
  runtime: {
    node?: string;
    python?: string;
    go?: string;
    package_manager: string;
  };
  dependencies: {
    production: DependencyEntry[];
    development: DependencyEntry[];
  };
  integrations: IntegrationEntry[];
  internal_dependencies: InternalDep[];
}

export interface DependencyEntry {
  name: string;
  version: string;
  purpose: string;
  critical: boolean;
}

export interface IntegrationEntry {
  name: string;
  type: string;
  project_ref?: string;
}

export interface InternalDep {
  repo: string;
  reason: string;
}
