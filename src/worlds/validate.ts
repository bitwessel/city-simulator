import type {
  BuildingKind,
  CityMood,
  CityQuirk,
  DistrictType,
  FactionArchetype,
  GameEventDef,
  WorldDef,
} from '../types';
import { LANDMARK_BUILDING_KINDS, WONDER_BUILDING_KINDS } from '../types';
import { EVENT_POOL } from '../events/data/events';
import { QUIRK_POOL } from '../generation/data/quirks';

// ---------------------------------------------------------------------------
// Curated-world validator (phase 07). Pure TypeScript, no React/three, no new
// dependency — hand-rolled so a broken world file fails *friendly* (in the app
// picker and in the CLI), never a crash. Robust to `raw` being any garbage:
// always returns a result, never throws.
//
// Error messages are specific and quote the world id so an author authoring a
// world in a Claude Code session can fix it without spelunking.
// ---------------------------------------------------------------------------

export interface WorldValidationOk {
  ok: true;
  world: WorldDef;
  warnings: string[];
}
export interface WorldValidationErr {
  ok: false;
  errors: string[];
  warnings: string[];
}
export type WorldValidationResult = WorldValidationOk | WorldValidationErr;

// ----- Known runtime value sets (the type unions aren't reflectable) --------

/** Every valid district type. Mirrors the `DistrictType` union in types. */
const DISTRICT_TYPES: ReadonlySet<DistrictType> = new Set<DistrictType>([
  'old-town',
  'market',
  'harbor',
  'forest-edge',
  'academy',
  'industrial',
  'noble-hill',
  'workers',
  'garden',
  'ruins',
  'festival',
  'magical',
]);

/** Every valid faction archetype. Mirrors the `FactionArchetype` union. */
const FACTION_ARCHETYPES: ReadonlySet<FactionArchetype> = new Set<FactionArchetype>([
  'merchants',
  'gardeners',
  'engineers',
  'mages',
  'workers',
  'nobles',
  'goblin-union',
  'street-performers',
  'archivists',
  'fishermen',
  'inventors',
  'night-watch',
]);

/** Every valid city mood. Mirrors the `CityMood` union. */
const CITY_MOODS: ReadonlySet<CityMood> = new Set<CityMood>([
  'thriving',
  'serene',
  'gritty',
  'chaotic',
  'arcane',
  'polluted',
  'festive',
  'declining',
]);

/**
 * Every valid building kind. Mirrors the `BuildingKind` union — the classic
 * low kinds plus the tall, landmark, and wonder kinds (reusing the exported
 * landmark/wonder lists so this stays in sync as those grow).
 */
const BUILDING_KINDS: ReadonlySet<BuildingKind> = new Set<BuildingKind>([
  'house',
  'tower',
  'market-stall',
  'workshop',
  'temple',
  'tavern',
  'warehouse',
  'mansion',
  'library',
  'wizard-tower',
  'statue',
  'mill',
  'dock',
  'greenhouse',
  'ruin',
  'fountain',
  'tent',
  'apartment',
  'skyscraper',
  'arcane-spire',
  'grand-hall',
  ...LANDMARK_BUILDING_KINDS,
  ...WONDER_BUILDING_KINDS,
]);

/** Recognised top-level world fields; anything else warns (forward-compat). */
const KNOWN_TOP_LEVEL_FIELDS = new Set<string>([
  'schemaVersion',
  'id',
  'name',
  'baseSeed',
  'lore',
  'terrain',
  'districts',
  'landmarks',
  'factions',
  'cast',
  'quirks',
  'events',
]);

// ----- Small helpers --------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

// ----- The validator --------------------------------------------------------

/**
 * Validate an unknown value as a `WorldDef`. Returns `{ ok: true, world, warnings }`
 * for a usable world (with non-fatal notes), or `{ ok: false, errors, warnings }`
 * with friendly, specific messages. Never throws.
 */
export function validateWorld(raw: unknown): WorldValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObject(raw)) {
    return { ok: false, errors: ['world file must be a JSON object'], warnings };
  }

  // The id is used in nearly every message; resolve a label even if invalid.
  const idLabel = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : '<unknown>';
  const label = (msg: string) => `world "${idLabel}": ${msg}`;

  // ----- schemaVersion gate (hard error so old/new files fail loud) --------
  if (raw.schemaVersion !== 1) {
    errors.push(
      label(
        `schemaVersion must be 1 (got ${JSON.stringify(raw.schemaVersion)})`,
      ),
    );
  }

  // ----- Required string fields --------------------------------------------
  if (!isNonEmptyString(raw.id)) {
    errors.push(label('id must be a non-empty string'));
  }
  if (!isNonEmptyString(raw.name)) {
    errors.push(label('name must be a non-empty string'));
  }
  if (!isNonEmptyString(raw.baseSeed)) {
    errors.push(label('baseSeed must be a non-empty string'));
  }

  // ----- Unknown top-level fields warn (forward-compat) --------------------
  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL_FIELDS.has(key)) {
      warnings.push(label(`unknown field "${key}" ignored`));
    }
  }

  // ----- Lore --------------------------------------------------------------
  if (raw.lore !== undefined) {
    if (!isObject(raw.lore)) {
      errors.push(label('lore must be an object'));
    } else if (
      raw.lore.moodLean !== undefined &&
      !CITY_MOODS.has(raw.lore.moodLean as CityMood)
    ) {
      errors.push(label(`lore.moodLean "${String(raw.lore.moodLean)}" is not a valid mood`));
    }
  }

  // ----- Terrain (shallow partial; only sanity-check the type) -------------
  if (raw.terrain !== undefined && !isObject(raw.terrain)) {
    errors.push(label('terrain must be an object'));
  }

  // ----- Districts ---------------------------------------------------------
  if (raw.districts !== undefined) {
    if (!Array.isArray(raw.districts)) {
      errors.push(label('districts must be an array'));
    } else {
      raw.districts.forEach((d, i) => {
        if (!isObject(d)) {
          errors.push(label(`districts[${i}] must be an object`));
          return;
        }
        if (!DISTRICT_TYPES.has(d.type as DistrictType)) {
          errors.push(label(`districts[${i}].type "${String(d.type)}" is not a valid district type`));
        }
        if (d.position !== undefined && !isPosition(d.position)) {
          errors.push(label(`districts[${i}].position must be { x: number, z: number }`));
        }
        if (d.wealthTilt !== undefined && typeof d.wealthTilt !== 'number') {
          errors.push(label(`districts[${i}].wealthTilt must be a number`));
        }
      });
    }
  }

  // ----- Landmarks ---------------------------------------------------------
  if (raw.landmarks !== undefined) {
    if (!Array.isArray(raw.landmarks)) {
      errors.push(label('landmarks must be an array'));
    } else {
      raw.landmarks.forEach((l, i) => {
        if (!isObject(l)) {
          errors.push(label(`landmarks[${i}] must be an object`));
          return;
        }
        if (!BUILDING_KINDS.has(l.building as BuildingKind)) {
          errors.push(label(`landmarks[${i}].building "${String(l.building)}" is not a valid building kind`));
        } else if (!LANDMARK_BUILDING_KINDS.includes(l.building as BuildingKind)) {
          // Valid kind, but not a commissioned-landmark kind — allowed, but
          // unusual (no completed-project record will be created for it).
          warnings.push(
            label(
              `landmarks[${i}].building "${String(l.building)}" is not a landmark-project kind; it will be placed but not recorded as a completed project`,
            ),
          );
        }
        if (
          l.districtType !== undefined &&
          !DISTRICT_TYPES.has(l.districtType as DistrictType)
        ) {
          errors.push(label(`landmarks[${i}].districtType "${String(l.districtType)}" is not a valid district type`));
        }
      });
    }
  }

  // ----- Factions ----------------------------------------------------------
  if (raw.factions !== undefined) {
    if (!Array.isArray(raw.factions)) {
      errors.push(label('factions must be an array'));
    } else {
      raw.factions.forEach((f, i) => {
        if (!isObject(f)) {
          errors.push(label(`factions[${i}] must be an object`));
          return;
        }
        if (!FACTION_ARCHETYPES.has(f.archetype as FactionArchetype)) {
          errors.push(label(`factions[${i}].archetype "${String(f.archetype)}" is not a valid faction archetype`));
        }
        if (f.relationshipOverrides !== undefined) {
          if (!isObject(f.relationshipOverrides)) {
            errors.push(label(`factions[${i}].relationshipOverrides must be an object`));
          } else {
            for (const key of Object.keys(f.relationshipOverrides)) {
              if (!FACTION_ARCHETYPES.has(key as FactionArchetype)) {
                errors.push(
                  label(
                    `factions[${i}].relationshipOverrides key "${key}" is not a valid faction archetype`,
                  ),
                );
              }
            }
          }
        }
      });
    }
  }

  // ----- Quirks (string ids from the pool, or inline defs) -----------------
  if (raw.quirks !== undefined) {
    if (!Array.isArray(raw.quirks)) {
      errors.push(label('quirks must be an array'));
    } else {
      raw.quirks.forEach((q, i) => {
        if (typeof q === 'string') {
          if (!QUIRK_POOL.some((def) => def.id === q)) {
            errors.push(label(`quirks[${i}] references unknown quirk id "${q}"`));
          }
        } else if (isObject(q)) {
          if (!isNonEmptyString((q as Partial<CityQuirk>).id)) {
            errors.push(label(`quirks[${i}] (inline) must have a non-empty string id`));
          }
        } else {
          errors.push(label(`quirks[${i}] must be a quirk id string or an inline quirk object`));
        }
      });
    }
  }

  // ----- Cast --------------------------------------------------------------
  if (raw.cast !== undefined) {
    if (!Array.isArray(raw.cast)) {
      errors.push(label('cast must be an array'));
    } else {
      raw.cast.forEach((c, i) => {
        if (!isObject(c)) {
          errors.push(label(`cast[${i}] must be an object`));
          return;
        }
        if (!isNonEmptyString(c.id)) errors.push(label(`cast[${i}].id must be a non-empty string`));
        if (!isNonEmptyString(c.name)) errors.push(label(`cast[${i}].name must be a non-empty string`));
      });
    }
  }

  // ----- Events (the heavy one: namespacing + uniqueness + chain refs) -----
  validateEvents(raw, idLabel, errors);

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }
  // Safe to assert: the shape checks above passed, so this is a usable WorldDef.
  return { ok: true, world: raw as unknown as WorldDef, warnings };
}

function isPosition(v: unknown): v is { x: number; z: number } {
  return isObject(v) && typeof v.x === 'number' && typeof v.z === 'number';
}

/**
 * Validate a world's bespoke events: ids present, namespaced `world/<id>/`,
 * unique within the world AND not colliding with the core `EVENT_POOL`, each
 * with 2-4 choices that carry effects + result text (mirrors
 * tests/events.test.ts), and every chain ref (`choice.unlocksEventId`,
 * `outcome.queueEventId`) resolving to a world event or a core pool id.
 */
function validateEvents(
  raw: Record<string, unknown>,
  idLabel: string,
  errors: string[],
): void {
  const label = (msg: string) => `world "${idLabel}": ${msg}`;
  if (raw.events === undefined) return;
  if (!Array.isArray(raw.events)) {
    errors.push(label('events must be an array'));
    return;
  }

  const namespace = `world/${idLabel}/`;
  const coreIds = new Set(EVENT_POOL.map((e) => e.id));
  const worldIds = new Set<string>();

  // First pass: collect ids (for chain-ref resolution) and check structure.
  for (const ev of raw.events as GameEventDef[]) {
    if (!isObject(ev)) {
      errors.push(label('every event must be an object'));
      continue;
    }
    if (!isNonEmptyString(ev.id)) {
      errors.push(label('every event must have a non-empty string id'));
      continue;
    }
    if (!ev.id.startsWith(namespace)) {
      errors.push(label(`event id "${ev.id}" must be namespaced "${namespace}..."`));
    }
    if (coreIds.has(ev.id)) {
      errors.push(label(`event id "${ev.id}" collides with a core event id`));
    }
    if (worldIds.has(ev.id)) {
      errors.push(label(`event id "${ev.id}" is duplicated within the world`));
    }
    worldIds.add(ev.id);

    if (!Array.isArray(ev.choices) || ev.choices.length < 2 || ev.choices.length > 4) {
      errors.push(label(`event "${ev.id}" must have 2-4 choices`));
      continue;
    }
    const choiceIds = new Set<string>();
    for (const choice of ev.choices) {
      if (!isObject(choice)) {
        errors.push(label(`event "${ev.id}" has a choice that is not an object`));
        continue;
      }
      if (!isNonEmptyString(choice.id)) {
        errors.push(label(`event "${ev.id}" has a choice without a string id`));
      } else if (choiceIds.has(choice.id)) {
        errors.push(label(`event "${ev.id}" choice id "${choice.id}" is duplicated`));
      } else {
        choiceIds.add(choice.id);
      }
      if (!isObject(choice.effects)) {
        errors.push(label(`event "${ev.id}" choice "${String(choice.id)}" must have an effects object`));
      }
      if (!isNonEmptyString(choice.resultText)) {
        errors.push(label(`event "${ev.id}" choice "${String(choice.id)}" must have resultText`));
      }
      for (const outcome of choice.outcomes ?? []) {
        if (
          typeof outcome.chance !== 'number' ||
          outcome.chance <= 0 ||
          outcome.chance > 1
        ) {
          errors.push(label(`event "${ev.id}" choice "${String(choice.id)}" has an outcome with chance outside (0, 1]`));
        }
      }
    }
  }

  // Second pass: every chain ref resolves to a world event or a core pool id.
  const resolvable = (refId: string): boolean => worldIds.has(refId) || coreIds.has(refId);
  for (const ev of raw.events as GameEventDef[]) {
    if (!isObject(ev) || !Array.isArray(ev.choices)) continue;
    for (const choice of ev.choices) {
      if (!isObject(choice)) continue;
      if (choice.unlocksEventId && !resolvable(choice.unlocksEventId)) {
        errors.push(
          label(
            `event "${String(ev.id)}" choice "${String(choice.id)}" unlocks unknown event "${choice.unlocksEventId}"`,
          ),
        );
      }
      for (const outcome of choice.outcomes ?? []) {
        if (outcome.queueEventId && !resolvable(outcome.queueEventId)) {
          errors.push(
            label(
              `event "${String(ev.id)}" choice "${String(choice.id)}" queues unknown event "${outcome.queueEventId}"`,
            ),
          );
        }
      }
    }
  }
}
