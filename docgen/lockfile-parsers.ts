/**
 * Kaycha DocGen — Lockfile Parsers
 * Parse npm package-lock.json (v3) and pnpm pnpm-lock.yaml (v9)
 * to extract resolved versions and dependency graphs.
 * No external YAML library — pnpm parsed via line-based state machine.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ─── Types ────────────────────────────────────────────────────────

export interface ResolvedPackage {
  name: string;
  version: string;
  dev: boolean;
  directDeps: string[];  // dependency names this package requires
}

export interface LockfileData {
  packages: Map<string, ResolvedPackage>;  // keyed by package name
  prodNames: Set<string>;   // top-level production dependency names
  devNames: Set<string>;    // top-level devDependency names
}

// ─── npm package-lock.json v3 ─────────────────────────────────────

/**
 * Parse npm package-lock.json v3 format.
 * Returns null if file doesn't exist, version is unsupported, or parsing fails.
 */
export function parseNpmLockfile(repoRoot: string): LockfileData | null {
  const lockPath = join(repoRoot, 'package-lock.json');
  if (!existsSync(lockPath)) return null;

  try {
    const raw = readFileSync(lockPath, 'utf-8');
    const lock = JSON.parse(raw);

    // Require v3 format (npm >=7)
    if (!lock.lockfileVersion || lock.lockfileVersion < 3) return null;
    if (!lock.packages) return null;

    const packages = new Map<string, ResolvedPackage>();
    const prodNames = new Set<string>();
    const devNames = new Set<string>();

    // Root entry at packages[""] has the top-level dependency lists
    const root = lock.packages[''];
    if (root) {
      if (root.dependencies) {
        for (const name of Object.keys(root.dependencies)) {
          prodNames.add(name);
        }
      }
      if (root.devDependencies) {
        for (const name of Object.keys(root.devDependencies)) {
          devNames.add(name);
        }
      }
    }

    // Iterate all packages except root
    for (const [key, entry] of Object.entries(lock.packages)) {
      if (key === '') continue;  // skip root

      const pkg = entry as Record<string, unknown>;
      if (!pkg.version) continue;

      // Extract package name from key: "node_modules/@scope/name" → "@scope/name"
      // Skip deeply nested entries like "node_modules/A/node_modules/B"
      const prefix = 'node_modules/';
      if (!key.startsWith(prefix)) continue;
      const afterPrefix = key.slice(prefix.length);
      if (afterPrefix.includes('node_modules/')) continue;  // nested override, skip

      const name = afterPrefix;
      const deps = pkg.dependencies as Record<string, string> | undefined;
      const directDeps = deps ? Object.keys(deps) : [];

      packages.set(name, {
        name,
        version: pkg.version as string,
        dev: !!pkg.dev,
        directDeps,
      });
    }

    return { packages, prodNames, devNames };
  } catch {
    return null;
  }
}

// ─── pnpm pnpm-lock.yaml v9 ──────────────────────────────────────

type PnpmParserMode =
  | 'IDLE'
  | 'IMPORTERS'
  | 'IMP_PROD_DEPS'
  | 'IMP_DEV_DEPS'
  | 'PACKAGES'
  | 'SNAPSHOTS'
  | 'SNAP_ENTRY'
  | 'SNAP_DEPS';

/**
 * Parse pnpm pnpm-lock.yaml v9 format using line-based state machine.
 * Returns null if file doesn't exist, version is unsupported, or parsing fails.
 */
export function parsePnpmLockfile(repoRoot: string): LockfileData | null {
  const lockPath = join(repoRoot, 'pnpm-lock.yaml');
  if (!existsSync(lockPath)) return null;

  try {
    const raw = readFileSync(lockPath, 'utf-8');
    const lines = raw.split('\n');

    // Validate lockfile version
    if (!lines[0]?.includes("lockfileVersion: '9.0'") && !lines[0]?.includes('lockfileVersion: 9.0')) {
      return null;
    }

    const prodNames = new Set<string>();
    const devNames = new Set<string>();
    // snapVersionMap: "name@version" → { directDeps }
    const snapVersionMap = new Map<string, { version: string; directDeps: string[] }>();
    // nameToVersion: "name" → "version" (from importers section)
    const nameToVersion = new Map<string, string>();

    let mode: PnpmParserMode = 'IDLE';
    let currentSnapName = '';
    let currentSnapVersion = '';
    let currentSnapDeps: string[] = [];
    let inRootImporter = false;
    let lastDepName = '';  // tracks the most recent dep name in importers section

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();  // fully trimmed for content comparison

      // Top-level section detection (no leading whitespace)
      if (!line.startsWith(' ') && !line.startsWith('\t')) {
        // Flush any open snapshot entry
        if (mode === 'SNAP_DEPS' || mode === 'SNAP_ENTRY') {
          if (currentSnapName) {
            snapVersionMap.set(currentSnapName, {
              version: currentSnapVersion,
              directDeps: currentSnapDeps,
            });
          }
          currentSnapName = '';
          currentSnapVersion = '';
          currentSnapDeps = [];
        }

        if (trimmed === 'importers:') {
          mode = 'IMPORTERS';
          inRootImporter = false;
          continue;
        }
        if (trimmed === 'packages:') {
          mode = 'PACKAGES';
          continue;
        }
        if (trimmed === 'snapshots:') {
          mode = 'SNAPSHOTS';
          continue;
        }
        // Any other top-level section resets mode
        if (trimmed.endsWith(':') && !trimmed.startsWith(' ')) {
          mode = 'IDLE';
          continue;
        }
      }

      // ─── IMPORTERS section ───
      if (mode === 'IMPORTERS' || mode === 'IMP_PROD_DEPS' || mode === 'IMP_DEV_DEPS') {
        const indent = line.length - line.trimStart().length;

        // Root importer "." at 2-indent — can be "'.':",".:","'.'"
        if (indent === 2 && (trimmed === '.:' || trimmed === "'.':")) {
          inRootImporter = true;
          mode = 'IMPORTERS';
          lastDepName = '';
          continue;
        }

        // Another importer at 2-indent → stop parsing root importer
        if (indent === 2 && trimmed !== '.:' && trimmed !== "'.':") {
          inRootImporter = false;
          mode = 'IMPORTERS';
          continue;
        }

        if (!inRootImporter) continue;

        // dependencies/devDependencies blocks at 4-indent
        if (indent === 4 && trimmed === 'dependencies:') {
          mode = 'IMP_PROD_DEPS';
          lastDepName = '';
          continue;
        }
        if (indent === 4 && trimmed === 'devDependencies:') {
          mode = 'IMP_DEV_DEPS';
          lastDepName = '';
          continue;
        }
        // Any other 4-indent key = another block under root importer
        if (indent === 4 && trimmed.endsWith(':')) {
          mode = 'IMPORTERS';
          continue;
        }

        // Package entries at 6-indent under dependencies/devDependencies
        // Format: "      '@supabase/supabase-js':" or "      zod:"
        if (indent === 6 && trimmed.endsWith(':') && (mode === 'IMP_PROD_DEPS' || mode === 'IMP_DEV_DEPS')) {
          const depName = trimmed.slice(0, -1).replace(/^'|'$/g, '');
          if (depName) {
            lastDepName = depName;
            if (mode === 'IMP_PROD_DEPS') prodNames.add(depName);
            else devNames.add(depName);
          }
          continue;
        }

        // Specifier and version at 8-indent
        if (indent === 8 && (mode === 'IMP_PROD_DEPS' || mode === 'IMP_DEV_DEPS')) {
          const versionMatch = trimmed.match(/^version:\s*(.+)/);
          if (versionMatch && lastDepName) {
            const version = stripPeerQualifier(versionMatch[1].trim());
            nameToVersion.set(lastDepName, version);
          }
          continue;
        }
      }

      // ─── SNAPSHOTS section ───
      if (mode === 'SNAPSHOTS' || mode === 'SNAP_ENTRY' || mode === 'SNAP_DEPS') {
        const indent = line.length - line.trimStart().length;

        // Snapshot entry at 2-indent: "  '@supabase/supabase-js@2.95.3':"
        if (indent === 2 && trimmed.endsWith(':')) {
          // Flush previous entry
          if (currentSnapName) {
            snapVersionMap.set(currentSnapName, {
              version: currentSnapVersion,
              directDeps: currentSnapDeps,
            });
          }

          // Parse name@version from the entry key
          const entryKey = trimmed.slice(0, -1).replace(/^'|'$/g, '');
          const parsed = parseSnapKey(entryKey);
          if (parsed) {
            currentSnapName = parsed.name;
            currentSnapVersion = parsed.version;
            currentSnapDeps = [];
            mode = 'SNAP_ENTRY';
          } else {
            currentSnapName = '';
            currentSnapVersion = '';
            currentSnapDeps = [];
            mode = 'SNAPSHOTS';
          }
          continue;
        }

        // dependencies block at 4-indent under a snapshot entry
        if (indent === 4 && trimmed === 'dependencies:' && mode === 'SNAP_ENTRY') {
          mode = 'SNAP_DEPS';
          continue;
        }

        // Any other 4-indent block under snapshot entry
        if (indent === 4 && trimmed.endsWith(':') && mode !== 'SNAP_DEPS') {
          mode = 'SNAP_ENTRY';
          continue;
        }
        if (indent === 4 && trimmed.endsWith(':') && mode === 'SNAP_DEPS') {
          // Leaving deps block into another block
          mode = 'SNAP_ENTRY';
          continue;
        }

        // Dependency entry at 6-indent: "      '@supabase/auth-js': 2.95.3"
        if (indent === 6 && mode === 'SNAP_DEPS') {
          const depMatch = trimmed.match(/^([^:]+):\s*(.+)/);
          if (depMatch) {
            const depName = depMatch[1].replace(/^'|'$/g, '').trim();
            currentSnapDeps.push(depName);
          }
          continue;
        }
      }
    }

    // Flush last snapshot entry
    if (currentSnapName) {
      snapVersionMap.set(currentSnapName, {
        version: currentSnapVersion,
        directDeps: currentSnapDeps,
      });
    }

    // ─── Build LockfileData from parsed sections ───
    const packages = new Map<string, ResolvedPackage>();

    for (const [name, entry] of snapVersionMap) {
      const isDev = devNames.has(name) && !prodNames.has(name);
      packages.set(name, {
        name,
        version: entry.version,
        dev: isDev,
        directDeps: entry.directDeps,
      });
    }

    // Also add any deps from importers that aren't in snapshots (shouldn't happen, but safety)
    for (const name of [...prodNames, ...devNames]) {
      if (!packages.has(name)) {
        const version = nameToVersion.get(name) || '';
        if (version) {
          packages.set(name, {
            name,
            version,
            dev: devNames.has(name) && !prodNames.has(name),
            directDeps: [],
          });
        }
      }
    }

    return { packages, prodNames, devNames };
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Strip pnpm peer qualifier from version strings.
 * "1.26.0(zod@3.25.76)" → "1.26.0"
 * "2.95.3" → "2.95.3"
 */
function stripPeerQualifier(version: string): string {
  const parenIdx = version.indexOf('(');
  if (parenIdx > 0) return version.slice(0, parenIdx);
  return version;
}

/**
 * Parse a snapshot key like "@supabase/supabase-js@2.95.3" or
 * "@supabase/auth-js@2.95.3(zod@3.25.76)" into { name, version }.
 * Handles scoped packages (@scope/name@version) correctly.
 */
function parseSnapKey(key: string): { name: string; version: string } | null {
  // Strip peer qualifier first
  const clean = stripPeerQualifier(key);

  // Find the last @ that separates name from version
  // For scoped packages, the first @ is part of the name
  const lastAt = clean.lastIndexOf('@');
  if (lastAt <= 0) return null;  // no @ or only leading @ (broken)

  const name = clean.slice(0, lastAt);
  const version = clean.slice(lastAt + 1);

  if (!name || !version) return null;
  return { name, version };
}
