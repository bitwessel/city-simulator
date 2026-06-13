// Headless playtest: run N hands-off simulations of a curated world and report
// outcome distribution, days-survived stats, and bespoke-event-fire rate.
// Usage (via vite-node):
//   npm run playtest-world -- <id> [N]   (N defaults to 20)
//
// "Hands-off" mirrors balance-helpers.ts: memos are left to lapse; the
// simulation just ticks until an outcome or the day cap (400 days).

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateWorld } from '../src/worlds/validate.ts';
import { generateCityFromWorld } from '../src/worlds/loadWorld.ts';
import { simulateDay, lapseEvent, EVENT_RESPONSE_WINDOW_DAYS } from '../src/simulation/engine.ts';

const ROOT = resolve(import.meta.dirname, '..');
const WORLDS_DIR = join(ROOT, 'worlds');

const DAY_CAP = 400;

// ---- helpers ----------------------------------------------------------------

function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function red(s)   { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s){ return `\x1b[33m${s}\x1b[0m`; }
function bold(s)  { return `\x1b[1m${s}\x1b[0m`; }
function cyan(s)  { return `\x1b[36m${s}\x1b[0m`; }

function median(arr) {
  if (arr.length === 0) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

/** Get the stat snapshot nearest to (and not exceeding) `targetDay`. */
function snapAtDay(history, targetDay) {
  let best = null;
  for (const h of history) {
    if (h.day <= targetDay) best = h;
    else break;
  }
  return best;
}

// ---- Load + validate world --------------------------------------------------

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error(red('Usage: npm run playtest-world -- <id> [N]'));
  process.exit(1);
}

const id = argv[0];
const N = parseInt(argv[1] ?? '20', 10);
if (isNaN(N) || N < 1) {
  console.error(red(`N must be a positive integer (got "${argv[1]}")`));
  process.exit(1);
}

const worldPath = join(WORLDS_DIR, id, 'world.json');
let worldDef;
try {
  const raw = JSON.parse(readFileSync(worldPath, 'utf-8'));
  const result = validateWorld(raw);
  if (!result.ok) {
    console.error(red(`[playtest] world "${id}" failed validation:`));
    for (const e of result.errors) console.error(`  ${red('✗')} ${e}`);
    process.exit(1);
  }
  if (result.warnings.length > 0) {
    for (const w of result.warnings) console.warn(`  ${yellow('!')} ${w}`);
  }
  worldDef = result.world;
} catch (e) {
  console.error(red(`[playtest] Could not load worlds/${id}/world.json: ${e.message}`));
  process.exit(1);
}

console.log(`\n${bold(cyan(`[playtest] ${worldDef.name}`))} — ${N} hands-off runs, cap ${DAY_CAP} days\n`);

// The bespoke event namespace for this world.
const WORLD_NS = `world/${id}/`;

// ---- Run N simulations ------------------------------------------------------

const outcomes = {}; // outcome kind → count
let totalDays = 0;
const daysList = [];
let bespokeFired = 0;
let representativeCity = null; // for the trajectory report

for (let run = 0; run < N; run++) {
  // Each run uses a distinct variationSeed so unspecified parts vary.
  const city = generateCityFromWorld(worldDef, `run-${run}`);
  let current = city;
  let activeEvent = null;
  let bespokeSeenThisRun = false;

  for (let day = 0; day < DAY_CAP; day++) {
    if (current.outcome) break;

    const result = simulateDay(current, { suppressEvents: activeEvent !== null });
    current = result.city;

    // Track bespoke world event firing.
    if (result.triggeredEvent && result.triggeredEvent.defId.startsWith(WORLD_NS)) {
      bespokeSeenThisRun = true;
    }

    // Hands-off: lapse waiting memos; adopt new ones.
    if (activeEvent && current.day > activeEvent.day + EVENT_RESPONSE_WINDOW_DAYS) {
      current = lapseEvent(current, activeEvent);
      activeEvent = null;
    } else if (result.triggeredEvent && !activeEvent) {
      activeEvent = result.triggeredEvent;
    }

    if (result.outcome) {
      activeEvent = null;
      break;
    }
  }

  const days = current.day;
  totalDays += days;
  daysList.push(days);

  const outcomeKind = current.outcome ? current.outcome.kind : 'ongoing';
  outcomes[outcomeKind] = (outcomes[outcomeKind] ?? 0) + 1;

  if (bespokeSeenThisRun) bespokeFired++;

  // Use run-0 as the representative (consistent seed for readability).
  if (run === 0) representativeCity = current;

  process.stdout.write(`  run ${String(run + 1).padStart(2)}/${N}: ${days} days → ${outcomeKind}\n`);
}

// ---- Report -----------------------------------------------------------------

const sortedDays = [...daysList].sort((a, b) => a - b);
const minDays = sortedDays[0];
const maxDays = sortedDays[sortedDays.length - 1];
const medDays = median(daysList);
const bespokePct = ((bespokeFired / N) * 100).toFixed(0);

console.log(`\n${bold('── Outcome distribution ─────────────────────────────────────────')}`);
const sortedOutcomes = Object.entries(outcomes).sort((a, b) => b[1] - a[1]);
for (const [kind, count] of sortedOutcomes) {
  const pct = ((count / N) * 100).toFixed(0);
  const bar = '█'.repeat(Math.round(count / N * 20));
  console.log(`  ${String(kind).padEnd(24)} ${String(count).padStart(3)}/${N} (${String(pct).padStart(3)}%)  ${bar}`);
}

console.log(`\n${bold('── Days survived ────────────────────────────────────────────────')}`);
console.log(`  min: ${minDays}  median: ${medDays}  max: ${maxDays}`);

console.log(`\n${bold('── Bespoke world events ─────────────────────────────────────────')}`);
const bespokeColor = parseInt(bespokePct) >= 30 ? green : yellow;
console.log(`  ${bespokeColor(`${bespokeFired}/${N} runs (${bespokePct}%) fired at least one event from namespace "${WORLD_NS}"`)}`);

// Stat trajectory for the representative run (run-0).
if (representativeCity) {
  console.log(`\n${bold('── Stat trajectory (run-0, hands-off) ───────────────────────────')}`);
  console.log(`  ${'Day'.padEnd(6)} ${'happiness'.padEnd(11)} ${'wealth'.padEnd(9)} ${'population'.padEnd(12)}`);
  for (const targetDay of [1, 100, 200, 300, 400]) {
    const snap = snapAtDay(representativeCity.history, targetDay);
    if (!snap) continue;
    const h = String(Math.round(snap.stats.happiness)).padEnd(11);
    const w = String(Math.round(snap.stats.wealth)).padEnd(9);
    const p = String(Math.round(snap.stats.population)).padEnd(12);
    console.log(`  ${String(snap.day).padEnd(6)} ${h} ${w} ${p}`);
  }
}

console.log('');
