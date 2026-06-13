import type { City } from '../types';
import { clampStat } from '../utils/math';
import { EDICT_POOL } from './data/edicts';
import { edictChronicleEntry, pushChronicle } from './chronicle';

// Pure edict logic: validation, state transitions, and cooldown checks.
// No React, no RNG — edict drift is passive, deterministic, and driven by
// the catalog's dailyEffects exactly like quirk drift.

export const EDICT_COOLDOWN_DAYS = 10;

export function getEdictDef(id: string) {
  return EDICT_POOL.find((e) => e.id === id) ?? null;
}

/**
 * Days remaining until the mayor can change the standing edict again.
 * Returns 0 when no edict has ever been declared.
 */
export function edictCooldownRemaining(city: City): number {
  if (city.edictDeclaredDay === undefined) return 0;
  return Math.max(0, EDICT_COOLDOWN_DAYS - (city.day - city.edictDeclaredDay));
}

export type CanDeclareResult = { ok: true } | { ok: false; reason: string };

/**
 * Check whether the mayor may declare (or lift) an edict right now.
 * `edictId` of null means lifting the current edict.
 */
export function canDeclareEdict(city: City, edictId: string | null): CanDeclareResult {
  if (city.outcome) return { ok: false, reason: 'The city has reached its final chapter.' };
  const current = city.activeEdict ?? null;
  if (current === edictId) {
    return {
      ok: false,
      reason:
        edictId === null
          ? 'There is no standing edict to lift.'
          : 'That season is already in effect.',
    };
  }
  if (edictId !== null && !getEdictDef(edictId)) {
    return { ok: false, reason: 'Unknown edict.' };
  }
  const remaining = edictCooldownRemaining(city);
  if (remaining > 0) {
    return {
      ok: false,
      reason: `The council is still hanging the bunting from your last proclamation (${remaining} more day${remaining === 1 ? '' : 's'}).`,
    };
  }
  return { ok: true };
}

/**
 * Apply a declaration (or lift) to a cloned city. Returns the original city
 * unchanged when the declaration is invalid.
 */
export function declareEdict(city: City, edictId: string | null): City {
  const check = canDeclareEdict(city, edictId);
  if (!check.ok) return city;

  const next = structuredClone(city);

  if (edictId === null) {
    delete next.activeEdict;
    next.edictDeclaredDay = city.day;
    next.edictLog = [...(next.edictLog ?? []), { day: city.day, edictId: null }];
    next.news.push({
      day: city.day,
      text: 'The mayor quietly sets aside the standing proclamation. Life resumes its ordinary shape.',
      tone: 'neutral',
    });
    pushChronicle(next, edictChronicleEntry(next, null));
  } else {
    const def = getEdictDef(edictId)!;
    next.activeEdict = edictId;
    next.edictDeclaredDay = city.day;
    next.edictLog = [...(next.edictLog ?? []), { day: city.day, edictId }];

    // One-time faction satisfaction nudges on declaration.
    if (def.factionReactions) {
      for (const [archetype, delta] of Object.entries(def.factionReactions)) {
        const faction = next.factions.find((f) => f.archetype === archetype);
        if (faction) {
          faction.satisfaction = clampStat(faction.satisfaction + (delta as number));
        }
      }
    }

    // Push the proclamation text into the news feed, resolving {city}.
    const text = def.proclamation.replaceAll('{city}', next.name);
    next.news.push({ day: city.day, text, tone: 'good' });
    pushChronicle(next, edictChronicleEntry(next, def.name));
  }

  return next;
}
