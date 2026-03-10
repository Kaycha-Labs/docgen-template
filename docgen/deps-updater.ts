/**
 * Kaycha DocGen — DEPS.yaml + CLAUDE.md Generator
 * Parses lockfiles and package manifests to produce machine-readable dependency maps.
 * Now with real dependency tree traversal from lockfiles (npm v3, pnpm v9).
 * No LLM required — deterministic parsing.
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DepsYaml, DependencyEntry, IntegrationEntry } from './types.js';
import { parseNpmLockfile, parsePnpmLockfile, LockfileData } from './lockfile-parsers.js';

const GENERATOR_VERSION = 'kaycha-docgen@1.0.0';

// ─── Public API ───────────────────────────────────────────────────

/**
 * Detect and parse dependencies, write DEPS.yaml and update CLAUDE.md.
 * Returns list of files written.
 */
export function updateDeps(repoRoot: string, repoName: string): string[] {
  const deps = buildDepsYaml(repoRoot, repoName);
  const written: string[] = [];

  // Write DEPS.yaml
  const depsPath = join(repoRoot, 'DEPS.yaml');
  writeFileSync(depsPath, serializeDepsYaml(deps), 'utf-8');
  written.push('DEPS.yaml');

  // Update CLAUDE.md with dependency section
  const claudePath = join(repoRoot, 'CLAUDE.md');
  updateClaudeMd(claudePath, deps, repoName);
  written.push('CLAUDE.md');

  return written;
}

// ─── Core Builder ─────────────────────────────────────────────────

function buildDepsYaml(repoRoot: string, repoName: string): DepsYaml {
  const deps: DepsYaml = {
    meta: {
      repo: repoName,
      generated_at: new Date().toISOString(),
      generator: GENERATOR_VERSION,
    },
    runtime: {
      package_manager: 'unknown',
    },
    dependencies: {
      production: [],
      development: [],
    },
    integrations: [],
    internal_dependencies: [],
  };

  // Detect Node.js project
  const pkgPath = join(repoRoot, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    // Detect package manager
    let pmType: 'pnpm' | 'yarn' | 'bun' | 'npm' = 'npm';
    if (existsSync(join(repoRoot, 'pnpm-lock.yaml'))) {
      pmType = 'pnpm';
    } else if (existsSync(join(repoRoot, 'yarn.lock'))) {
      pmType = 'yarn';
    } else if (existsSync(join(repoRoot, 'bun.lockb'))) {
      pmType = 'bun';
    }
    deps.runtime.package_manager = pmType;

    // Detect Node version
    deps.runtime.node = pkg.engines?.node || '20.x';

    // Attempt lockfile parse
    let lockData: LockfileData | null = null;
    if (pmType === 'npm') {
      lockData = parseNpmLockfile(repoRoot);
    } else if (pmType === 'pnpm') {
      lockData = parsePnpmLockfile(repoRoot);
    }
    // yarn and bun: no parser yet, fall through to package.json-only

    if (lockData) {
      // ─── Lockfile path: resolved versions + transitive trees ───
      deps.dependencies.production = buildResolvedDeps(
        pkg.dependencies || {},
        lockData,
        false,
      );
      deps.dependencies.development = buildResolvedDeps(
        pkg.devDependencies || {},
        lockData,
        true,
      );
    } else {
      // ─── Fallback: package.json only (identical to old behavior) ───
      if (pkg.dependencies) {
        deps.dependencies.production = Object.entries(pkg.dependencies).map(
          ([name, version]) => ({
            name,
            version: version as string,
            purpose: inferPurpose(name),
            critical: isCritical(name),
          }),
        );
      }
      if (pkg.devDependencies) {
        deps.dependencies.development = Object.entries(pkg.devDependencies).map(
          ([name, version]) => ({
            name,
            version: version as string,
            purpose: inferPurpose(name),
            critical: false,
          }),
        );
      }
    }
  }

  // Detect Python project
  const reqPath = join(repoRoot, 'requirements.txt');
  if (existsSync(reqPath)) {
    deps.runtime.python = '3.x';
    deps.runtime.package_manager = 'pip';
    const lines = readFileSync(reqPath, 'utf-8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    deps.dependencies.production = lines.map((line) => {
      const [name, version] = line.split(/[>=<~!]+/);
      return {
        name: name.trim(),
        version: version?.trim() || '*',
        purpose: inferPurpose(name.trim()),
        critical: isCritical(name.trim()),
      };
    });
  }

  // Detect Go project
  const goModPath = join(repoRoot, 'go.mod');
  if (existsSync(goModPath)) {
    deps.runtime.go = '1.x';
    deps.runtime.package_manager = 'go mod';
  }

  // Detect integrations
  deps.integrations = detectIntegrations(repoRoot);

  return deps;
}

// ─── Lockfile-Resolved Dependency Builder ─────────────────────────

/**
 * Build DependencyEntry[] using resolved data from lockfile.
 * For each dep in package.json, look up resolved version + transitive tree.
 */
function buildResolvedDeps(
  pkgDeps: Record<string, string>,
  lockData: LockfileData,
  isDev: boolean,
): DependencyEntry[] {
  return Object.entries(pkgDeps).map(([name, spec]) => {
    const resolved = lockData.packages.get(name);
    const critical = isDev ? false : isCritical(name);

    const entry: DependencyEntry = {
      name,
      version: resolved?.version || spec,
      spec: spec,
      purpose: inferPurpose(name),
      critical,
    };

    // Compute transitive dependency tree from lockfile graph
    if (resolved) {
      const tree = countTransitives(name, lockData);
      if (tree.count > 0) {
        entry.transitive_count = tree.count;
      }
      if (critical && tree.topDeps.length > 0) {
        entry.pulls_in = tree.topDeps;
      }
    }

    return entry;
  });
}

// ─── BFS Tree Traversal ──────────────────────────────────────────

interface TreeResult {
  count: number;      // total transitive deps
  topDeps: string[];  // direct children as "name@version", sorted by weight, max 10
}

/**
 * BFS from a root package through directDeps to count all transitive dependencies.
 * Returns total count + top direct children sorted by their own sub-tree size.
 */
function countTransitives(rootName: string, lockData: LockfileData): TreeResult {
  const rootPkg = lockData.packages.get(rootName);
  if (!rootPkg || rootPkg.directDeps.length === 0) {
    return { count: 0, topDeps: [] };
  }

  const visited = new Set<string>();
  visited.add(rootName);  // don't count the root itself

  // BFS queue: [depName]
  const queue: string[] = [...rootPkg.directDeps];

  // Track direct children separately for pulls_in with their sub-tree weights
  const directChildren: { name: string; version: string; weight: number }[] = [];

  // First, BFS the full tree to get count
  while (queue.length > 0) {
    const depName = queue.shift()!;
    if (visited.has(depName)) continue;
    visited.add(depName);

    const depPkg = lockData.packages.get(depName);
    if (depPkg) {
      for (const child of depPkg.directDeps) {
        if (!visited.has(child)) {
          queue.push(child);
        }
      }
    }
  }

  // Total transitive count = everything visited minus the root
  const count = visited.size - 1;

  // Now compute weight for each direct child (sub-tree size)
  for (const childName of rootPkg.directDeps) {
    const childPkg = lockData.packages.get(childName);
    if (!childPkg) continue;

    // Quick BFS for this child's subtree
    const childVisited = new Set<string>();
    childVisited.add(childName);
    const childQueue = [...childPkg.directDeps];
    while (childQueue.length > 0) {
      const n = childQueue.shift()!;
      if (childVisited.has(n)) continue;
      childVisited.add(n);
      const nPkg = lockData.packages.get(n);
      if (nPkg) {
        for (const c of nPkg.directDeps) {
          if (!childVisited.has(c)) childQueue.push(c);
        }
      }
    }

    directChildren.push({
      name: childName,
      version: childPkg.version,
      weight: childVisited.size,
    });
  }

  // Sort by weight descending (heaviest sub-trees first), cap at 10
  directChildren.sort((a, b) => b.weight - a.weight);
  const topDeps = directChildren
    .slice(0, 10)
    .map((d) => `${d.name}@${d.version}`);

  return { count, topDeps };
}

// ─── Integrations Detection ──────────────────────────────────────

function detectIntegrations(repoRoot: string): IntegrationEntry[] {
  const integrations: IntegrationEntry[] = [];

  // Supabase
  if (existsSync(join(repoRoot, 'supabase/config.toml')) || existsSync(join(repoRoot, 'supabase'))) {
    const entry: IntegrationEntry = { name: 'Supabase', type: 'database' };
    const configPath = join(repoRoot, 'supabase/config.toml');
    if (existsSync(configPath)) {
      const config = readFileSync(configPath, 'utf-8');
      const match = config.match(/project_id\s*=\s*"([^"]+)"/);
      if (match) entry.project_ref = match[1];
    }
    integrations.push(entry);
  }

  // Cloudflare Workers
  if (existsSync(join(repoRoot, 'wrangler.toml')) || existsSync(join(repoRoot, 'wrangler.jsonc'))) {
    integrations.push({ name: 'Cloudflare Workers', type: 'edge-runtime' });
  }

  // Netlify
  if (existsSync(join(repoRoot, 'netlify.toml'))) {
    integrations.push({ name: 'Netlify', type: 'hosting' });
  }

  // Vercel
  if (existsSync(join(repoRoot, 'vercel.json'))) {
    integrations.push({ name: 'Vercel', type: 'hosting' });
  }

  // Docker
  if (existsSync(join(repoRoot, 'Dockerfile')) || existsSync(join(repoRoot, 'docker-compose.yml'))) {
    integrations.push({ name: 'Docker', type: 'containerization' });
  }

  return integrations;
}

// ─── Purpose / Critical Heuristics ───────────────────────────────

/** Infer purpose from package name heuristics */
function inferPurpose(name: string): string {
  const purposes: [RegExp, string][] = [
    [/supabase/, 'Database client + auth'],
    [/react$/, 'UI framework'],
    [/react-dom/, 'React DOM rendering'],
    [/react-router/, 'Client-side routing'],
    [/tailwindcss/, 'Utility-first CSS'],
    [/vite$/, 'Build tool + dev server'],
    [/vitest/, 'Unit testing'],
    [/typescript/, 'Type checking'],
    [/eslint/, 'Code linting'],
    [/prettier/, 'Code formatting'],
    [/zod/, 'Schema validation'],
    [/tanstack.*query/, 'Data fetching + caching'],
    [/tanstack.*table/, 'Data table UI'],
    [/tanstack.*router/, 'Type-safe routing'],
    [/lucide/, 'Icon library'],
    [/shadcn|radix/, 'UI component library'],
    [/date-fns|dayjs|moment/, 'Date manipulation'],
    [/axios|ky$/, 'HTTP client'],
    [/zustand|jotai|recoil/, 'State management'],
    [/recharts|chart/, 'Data visualization'],
    [/anthropic/, 'Claude AI API client'],
    [/openai/, 'OpenAI API client'],
    [/stripe/, 'Payment processing'],
    [/resend|nodemailer/, 'Email sending'],
    [/puppeteer|playwright/, 'Browser automation'],
    [/prisma/, 'Database ORM'],
    [/drizzle/, 'Database ORM'],
    [/embla-carousel/, 'UI framework'],
  ];

  for (const [pattern, purpose] of purposes) {
    if (pattern.test(name)) return purpose;
  }
  return '';
}

/** Determine if a dependency is critical to the system */
function isCritical(name: string): boolean {
  const criticalPatterns = [
    /supabase/,
    /react$/,
    /next$/,
    /express$/,
    /fastify$/,
    /hono$/,
    /prisma/,
    /drizzle/,
    /stripe/,
    /anthropic/,
    /embla-carousel/,
  ];
  return criticalPatterns.some((p) => p.test(name));
}

// ─── YAML Serializer ─────────────────────────────────────────────

function serializeDepsYaml(deps: DepsYaml): string {
  const lines: string[] = [
    '# DEPS.yaml — Auto-generated by Kaycha DocGen. DO NOT EDIT MANUALLY.',
    `# Regenerated on every push that modifies lockfiles or package manifests.`,
    '',
    'meta:',
    `  repo: "${deps.meta.repo}"`,
    `  generated_at: "${deps.meta.generated_at}"`,
    `  generator: "${deps.meta.generator}"`,
    '',
    'runtime:',
  ];

  if (deps.runtime.node) lines.push(`  node: "${deps.runtime.node}"`);
  if (deps.runtime.python) lines.push(`  python: "${deps.runtime.python}"`);
  if (deps.runtime.go) lines.push(`  go: "${deps.runtime.go}"`);
  lines.push(`  package_manager: "${deps.runtime.package_manager}"`);

  lines.push('', 'dependencies:');

  // Production deps
  lines.push('  production:');
  if (deps.dependencies.production.length === 0) {
    lines.push('    []');
  } else {
    for (const dep of deps.dependencies.production) {
      lines.push(`    - name: "${dep.name}"`);
      lines.push(`      version: "${dep.version}"`);
      if (dep.spec) lines.push(`      spec: "${dep.spec}"`);
      lines.push(`      purpose: "${dep.purpose}"`);
      lines.push(`      critical: ${dep.critical}`);
      if (dep.transitive_count !== undefined) {
        lines.push(`      transitive_count: ${dep.transitive_count}`);
      }
      if (dep.pulls_in && dep.pulls_in.length > 0) {
        lines.push(`      pulls_in:`);
        for (const child of dep.pulls_in) {
          lines.push(`        - "${child}"`);
        }
      }
    }
  }

  // Dev deps
  lines.push('  development:');
  if (deps.dependencies.development.length === 0) {
    lines.push('    []');
  } else {
    for (const dep of deps.dependencies.development) {
      lines.push(`    - name: "${dep.name}"`);
      lines.push(`      version: "${dep.version}"`);
      if (dep.spec) lines.push(`      spec: "${dep.spec}"`);
      lines.push(`      purpose: "${dep.purpose}"`);
      lines.push(`      critical: ${dep.critical}`);
      if (dep.transitive_count !== undefined) {
        lines.push(`      transitive_count: ${dep.transitive_count}`);
      }
    }
  }

  // Integrations
  lines.push('', 'integrations:');
  if (deps.integrations.length === 0) {
    lines.push('  []');
  } else {
    for (const int of deps.integrations) {
      lines.push(`  - name: "${int.name}"`);
      lines.push(`    type: "${int.type}"`);
      if (int.project_ref) lines.push(`    project_ref: "${int.project_ref}"`);
    }
  }

  // Internal deps
  lines.push('', 'internal_dependencies:');
  if (deps.internal_dependencies.length === 0) {
    lines.push('  []');
  } else {
    for (const dep of deps.internal_dependencies) {
      lines.push(`  - repo: "${dep.repo}"`);
      lines.push(`    reason: "${dep.reason}"`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ─── CLAUDE.md Updater ───────────────────────────────────────────

function updateClaudeMd(claudePath: string, deps: DepsYaml, repoName: string): void {
  let existing = '';
  if (existsSync(claudePath)) {
    existing = readFileSync(claudePath, 'utf-8');
  }

  const depsSection = buildClaudeMdDepsSection(deps);

  if (existing) {
    // Replace existing deps section or append
    const marker = '## Current Dependencies';
    const markerIdx = existing.indexOf(marker);
    if (markerIdx !== -1) {
      // Find next ## or end of file
      const nextSection = existing.indexOf('\n## ', markerIdx + marker.length);
      if (nextSection !== -1) {
        existing = existing.slice(0, markerIdx) + depsSection + '\n' + existing.slice(nextSection);
      } else {
        existing = existing.slice(0, markerIdx) + depsSection;
      }
    } else {
      existing += '\n\n' + depsSection;
    }
    writeFileSync(claudePath, existing, 'utf-8');
  } else {
    // Create new CLAUDE.md
    const content = `# ${repoName}

This file provides context for AI agents working on this repository.

${depsSection}
`;
    writeFileSync(claudePath, content, 'utf-8');
  }
}

function buildClaudeMdDepsSection(deps: DepsYaml): string {
  const lines: string[] = ['## Current Dependencies', ''];

  if (deps.runtime.node) lines.push(`- **Runtime:** Node.js ${deps.runtime.node}`);
  if (deps.runtime.python) lines.push(`- **Runtime:** Python ${deps.runtime.python}`);
  if (deps.runtime.go) lines.push(`- **Runtime:** Go ${deps.runtime.go}`);
  lines.push(`- **Package Manager:** ${deps.runtime.package_manager}`);
  lines.push('');

  const critical = deps.dependencies.production.filter((d) => d.critical);
  if (critical.length > 0) {
    lines.push('### Critical Dependencies');
    for (const dep of critical) {
      const transitiveInfo = dep.transitive_count ? ` [${dep.transitive_count} transitive deps]` : '';
      lines.push(`- \`${dep.name}\` (${dep.version}) — ${dep.purpose}${transitiveInfo}`);
      if (dep.pulls_in && dep.pulls_in.length > 0) {
        for (const child of dep.pulls_in) {
          lines.push(`  - ${child}`);
        }
      }
    }
    lines.push('');
  }

  if (deps.integrations.length > 0) {
    lines.push('### Integrations');
    for (const int of deps.integrations) {
      lines.push(`- **${int.name}** (${int.type})${int.project_ref ? ` — ref: ${int.project_ref}` : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
