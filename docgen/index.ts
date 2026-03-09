/**
 * Kaycha DocGen — Main Orchestrator
 * Runs in GitHub Actions: analyzes diffs, generates/updates canonical docs via Claude API.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';

import { DocWorkItem, DOC_META, DOC_MODEL, RunLogEntry } from './types.js';
import { analyzeChangedFiles, hasLockfileChanges } from './diff-analyzer.js';
import { buildPrompt, getSystemPrompt } from './prompts.js';
import { buildSourceContext } from './source-context.js';
import { updateDeps } from './deps-updater.js';
import { generateBootstrapWorkItems, buildBootstrapContext, ensureDocsDir } from './scanner.js';
import { configureGit, getChangedFiles, getDiffSummary, isFirstRun, commitAndPush } from './git-utils.js';

// --- Environment ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || '';
const GITHUB_SHA = process.env.GITHUB_SHA || '';
const GITHUB_REF = process.env.GITHUB_REF || 'refs/heads/main';
const COMMIT_MESSAGE = process.env.COMMIT_MESSAGE || '';
const COMMIT_AUTHOR = process.env.COMMIT_AUTHOR || 'unknown';

if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is required');
  process.exit(1);
}

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// --- Derived values ---
const repoName = GITHUB_REPOSITORY.split('/').pop() || 'unknown-repo';
const repoRoot = process.cwd();
const commitDate = new Date().toISOString();
const branch = GITHUB_REF.replace('refs/heads/', '');

// --- Run tracking ---
let totalInputTokens = 0;
let totalOutputTokens = 0;
const startTime = Date.now();

async function main(): Promise<void> {
  console.log(`\n=== Kaycha DocGen ===`);
  console.log(`Repo: ${GITHUB_REPOSITORY}`);
  console.log(`Branch: ${branch}`);
  console.log(`Commit: ${GITHUB_SHA.slice(0, 8)} - ${COMMIT_MESSAGE}`);
  console.log(`Author: ${COMMIT_AUTHOR}\n`);

  // 1. Configure git
  configureGit();

  // 2. Ensure docs directory exists
  ensureDocsDir(repoRoot);

  // 3. Determine work items
  let workItems: DocWorkItem[];
  let sourceContextOverride: string | undefined;
  let lockfilesChanged: boolean;

  if (isFirstRun(repoRoot)) {
    console.log('First run detected - bootstrapping all docs from scratch.\n');
    workItems = generateBootstrapWorkItems(repoName);
    sourceContextOverride = buildBootstrapContext(repoRoot);
    lockfilesChanged = true;
  } else {
    const changedFiles = getChangedFiles();
    console.log(`Changed files (${changedFiles.length}):`);
    changedFiles.forEach((f) => console.log(`  ${f}`));
    console.log();

    workItems = analyzeChangedFiles(changedFiles, repoName);
    lockfilesChanged = hasLockfileChanges(changedFiles);
  }

  if (workItems.length === 0 && !lockfilesChanged) {
    console.log('No docs need updating. Exiting.');
    return;
  }

  console.log(`Docs to generate/update (${workItems.length}):`);
  workItems.forEach((w) => console.log(`  ${DOC_META[w.docType].title} -> ${w.outputPath}`));
  console.log();

  // 4. Get diff summary for prompts
  const diffSummary = getDiffSummary();

  // 5. Generate/update each doc (sequential)
  const writtenFiles: string[] = [];
  const docsGenerated: string[] = [];

  for (const workItem of workItems) {
    try {
      console.log(`Generating: ${DOC_META[workItem.docType].title}...`);

      const outputPath = join(repoRoot, workItem.outputPath);
      const existingContent = existsSync(outputPath) ? readFileSync(outputPath, 'utf-8') : '';
      const sourceContext = sourceContextOverride || buildSourceContext(workItem, repoRoot);

      const prompt = buildPrompt({
        docType: workItem.docType,
        docTitle: DOC_META[workItem.docType].title,
        repoName,
        existingContent,
        changedFiles: workItem.triggerFiles,
        diffSummary,
        sourceContext,
        commitMessage: COMMIT_MESSAGE,
        commitAuthor: COMMIT_AUTHOR,
        commitDate,
      });

      const model = DOC_MODEL[workItem.docType];
      const content = await generateDoc(prompt, model);

      writeFileSync(outputPath, content, 'utf-8');
      writtenFiles.push(workItem.outputPath);
      docsGenerated.push(DOC_META[workItem.docType].title);

      console.log(`  Done: ${DOC_META[workItem.docType].title} (${content.length} chars)`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`  Failed: ${DOC_META[workItem.docType].title}: ${errMsg}`);
      writeErrorDoc(workItem.outputPath, workItem.docType, errMsg);
    }
  }

  // 6. Update DEPS.yaml + CLAUDE.md if lockfiles changed
  if (lockfilesChanged) {
    console.log('\nUpdating DEPS.yaml + CLAUDE.md...');
    try {
      const depsFiles = updateDeps(repoRoot, repoName);
      writtenFiles.push(...depsFiles);
      console.log('  Done: DEPS.yaml + CLAUDE.md updated');
    } catch (error) {
      console.error(`  Failed: DEPS update: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 7. Write run log
  writeRunLog(docsGenerated, lockfilesChanged);

  // 8. Commit and push
  if (writtenFiles.length > 0) {
    writtenFiles.push('docgen/.run-log.jsonl');
    console.log(`\nCommitting ${writtenFiles.length} files...`);
    commitAndPush(writtenFiles, COMMIT_MESSAGE);
    console.log('\nDocGen complete.');
  } else {
    console.log('\nNo files written. Nothing to commit.');
  }

  const duration = Date.now() - startTime;
  console.log(`\n=== Summary ===`);
  console.log(`Docs generated: ${docsGenerated.length}`);
  console.log(`Total input tokens: ${totalInputTokens}`);
  console.log(`Total output tokens: ${totalOutputTokens}`);
  console.log(`Duration: ${(duration / 1000).toFixed(1)}s`);
}

async function generateDoc(prompt: string, model: string): Promise<string> {
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    temperature: 0.3,
    system: getSystemPrompt(),
    messages: [{ role: 'user', content: prompt }],
  });

  totalInputTokens += response.usage?.input_tokens || 0;
  totalOutputTokens += response.usage?.output_tokens || 0;

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in Claude response');
  }

  return textBlock.text;
}

function writeErrorDoc(outputPath: string, docType: string, error: string): void {
  const errorPath = join(repoRoot, 'docs', '.docgen-error.md');
  const content = `# DocGen Error\n\n**Document:** ${docType}\n**Target:** ${outputPath}\n**Time:** ${new Date().toISOString()}\n**Error:** ${error}\n\nThis error occurred during automatic doc generation. The target document was not updated.\n`;
  writeFileSync(errorPath, content, 'utf-8');
}

function writeRunLog(docsGenerated: string[], depsUpdated: boolean): void {
  const logDir = join(repoRoot, 'docgen');
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

  const logPath = join(logDir, '.run-log.jsonl');
  const entry: RunLogEntry = {
    timestamp: new Date().toISOString(),
    repo: GITHUB_REPOSITORY,
    branch,
    commitSha: GITHUB_SHA,
    commitMessage: COMMIT_MESSAGE,
    docsGenerated,
    depsUpdated,
    model: 'mixed',
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    durationMs: Date.now() - startTime,
  };

  appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8');
}

main().catch((error) => {
  console.error('DocGen failed:', error);
  const errorPath = join(repoRoot, 'docs', '.docgen-error.md');
  ensureDocsDir(repoRoot);
  writeFileSync(
    errorPath,
    `# DocGen Error\n\n**Time:** ${new Date().toISOString()}\n**Error:** ${error instanceof Error ? error.message : String(error)}\n`,
    'utf-8',
  );
  process.exit(0);
});
