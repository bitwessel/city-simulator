// Validate one or all curated worlds and rebuild worlds/index.json.
// Usage (via vite-node):
//   npm run validate-world -- <id>
//   npm run validate-world -- --all
//   npm run validate-world            (same as --all)
//
// Reads worlds/<id>/world.json, calls validateWorld(), prints friendly output.
// Exit 0 only when all requested worlds pass.
// Side-effect: always rebuilds worlds/index.json from every passing world.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateWorld } from '../src/worlds/validate.ts';

const ROOT = resolve(import.meta.dirname, '..');
const WORLDS_DIR = join(ROOT, 'worlds');

// ---- helpers ----------------------------------------------------------------

function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function red(s)   { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s){ return `\x1b[33m${s}\x1b[0m`; }
function bold(s)  { return `\x1b[1m${s}\x1b[0m`; }

/** List every immediate subdirectory of worlds/ that has a world.json. */
function listWorldIds() {
  let entries;
  try {
    entries = readdirSync(WORLDS_DIR);
  } catch {
    console.error(red('No worlds/ directory found — nothing to validate.'));
    process.exit(1);
  }
  return entries.filter((name) => {
    try {
      statSync(join(WORLDS_DIR, name, 'world.json'));
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Validate one world by id. Returns { ok, world } so the manifest builder can
 * collect passing worlds without re-parsing.
 */
function validateOne(id) {
  const path = join(WORLDS_DIR, id, 'world.json');

  // Read
  let raw;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    console.error(red(`[validate] FAIL  ${id}`));
    console.error(`  Could not read worlds/${id}/world.json — does the folder exist?`);
    return { ok: false, world: null };
  }

  // Parse
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error(red(`[validate] FAIL  ${id}`));
    console.error(`  worlds/${id}/world.json is not valid JSON: ${e.message}`);
    return { ok: false, world: null };
  }

  // Validate
  const result = validateWorld(parsed);

  if (!result.ok) {
    console.error(red(`[validate] FAIL  ${id}`));
    for (const err of result.errors) {
      console.error(`  ${red('✗')} ${err}`);
    }
    for (const warn of result.warnings) {
      console.warn(`  ${yellow('!')} ${warn}`);
    }
    return { ok: false, world: null };
  }

  // Warnings on passing worlds
  const name = result.world.name ?? id;
  if (result.warnings.length > 0) {
    console.log(green(`[validate] PASS  ${bold(name)}`) + yellow(` (${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''})`));
    for (const warn of result.warnings) {
      console.warn(`  ${yellow('!')} ${warn}`);
    }
  } else {
    console.log(green(`[validate] PASS  ${bold(name)}`));
  }

  return { ok: true, world: result.world };
}

// ---- Rebuild worlds/index.json from all passing worlds ----------------------

function rebuildIndex(passingWorlds) {
  const manifest = passingWorlds.map((w) => ({
    id: w.id,
    name: w.name,
    blurb: w.lore?.blurb ?? '',
  }));
  const json = JSON.stringify(manifest, null, 2) + '\n';
  const indexPath = join(ROOT, 'worlds', 'index.json');
  writeFileSync(indexPath, json, 'utf-8');
  console.log(`[validate] worlds/index.json updated (${manifest.length} world${manifest.length !== 1 ? 's' : ''})`);
}

// ---- Main -------------------------------------------------------------------

const argv = process.argv.slice(2);
const doAll = argv.length === 0 || argv.includes('--all');
const ids = doAll ? listWorldIds() : argv.filter((a) => a !== '--all');

if (ids.length === 0) {
  console.log('[validate] No worlds found to validate.');
  process.exit(0);
}

let anyFailed = false;

for (const id of ids) {
  const { ok } = validateOne(id);
  if (!ok) anyFailed = true;
}

// The manifest ALWAYS reflects every passing world on disk, independent of which
// id(s) were requested — so validating one world (or a bogus id) never clobbers
// the others' entries. A quiet full scan keeps it complete and authoritative.
const manifestWorlds = [];
for (const id of listWorldIds()) {
  try {
    const parsed = JSON.parse(readFileSync(join(WORLDS_DIR, id, 'world.json'), 'utf-8'));
    const result = validateWorld(parsed);
    if (result.ok) manifestWorlds.push(result.world);
  } catch {
    // Unreadable / malformed worlds simply don't appear in the manifest.
  }
}
rebuildIndex(manifestWorlds);

if (anyFailed) {
  process.exit(1);
}
