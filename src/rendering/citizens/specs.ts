// ---------------------------------------------------------------------------
// Spec builder.
//
// Turns a City into a flat, deterministic list of citizen + cart specs. A spec
// is the *structural* description of an agent (who they are, where they live,
// what activity they perform, what they wear / carry) — all derived through
// hashFloat(id, n) so it's stable across re-renders and day ticks. Per-frame
// wandering lives elsewhere and uses Math.random.
//
// Rebuilt cheaply whenever the city object changes; the frame loop keeps the
// moment-to-moment state in refs keyed by these stable ids.
// ---------------------------------------------------------------------------

import type { Building, City, District, NotableCitizen, TerrainData } from '../../types';
import { hashFloat } from '../hash';
import { riverDirectionFrom } from '../../generation/terrain';
import { roadCurve, type RoadCurve } from './bezier';
import {
  type Activity,
  type Hat,
  type PropKind,
  CLOTHES,
  KID_COLORS,
  MAGICAL_DISTRICTS,
  MARKET_DISTRICTS,
  MAX_CARTS,
  MAX_CITIZENS,
  ROBE_COLORS,
  SCHOLAR_COLORS,
  SKIN,
  TARGET_CITIZENS,
  WATCH_COLOR,
  WORK_DISTRICTS,
  moodCrowdMultiplier,
} from './constants';

export interface Vec2 {
  x: number;
  z: number;
}

/** One townsperson. All fields are deterministic for a given id. */
export interface CitizenSpec {
  id: string;
  districtId: string;
  activity: Activity;
  /** Platform center + usable radius (world coords). */
  center: Vec2;
  radius: number;
  /** Activity anchor points (doors, stalls, work endpoints, edge, landmark). */
  points: Vec2[];
  /** For dance/protest/social: a group key so members find each other. */
  group?: string;
  /** Wardrobe (deterministic). */
  bodyColor: string;
  skinColor: string;
  hat: Hat;
  /** Held prop kind; 'none' renders no prop instance. */
  prop: PropKind;
  /** Scale multiplier (kids are small). */
  scale: number;
  /** Base speed in world units / sec before mood scaling. */
  speed: number;
  /**
   * Phase 06 — when set, this instance IS a named cast member (the `id` of the
   * matching `NotableCitizen`). The renderer gives it a distinctive marker so
   * it's findable, maps raycast hits back to it, and the follow camera reads
   * its world position. Pure renderer binding — zero simulation impact.
   */
  castId?: string;
}

/** A cart trundling a road ribbon, optionally with a draft-animal blob. */
export interface CartSpec {
  id: string;
  curve: RoadCurve;
  /** Walkable param range (not buried under either platform). */
  tMin: number;
  tMax: number;
  bodyColor: string;
  speed: number;
}

export interface CrowdSpecs {
  citizens: CitizenSpec[];
  carts: CartSpec[];
}

/** Wood / canvas tones for cart bodies (used directly as instance color). */
const CART_WOODS = ['#9c7440', '#8a5e34', '#a9874e', '#7d5a3a', '#b39a72'];

/** Built buildings only — the renderer mirrors Districts' visibility filter. */
function builtBuildings(d: District): Building[] {
  return d.buildings.filter((b) => b.appearAt <= d.development / 100);
}

/** Find landmark buildings to anchor lounging / dancing (fountains, statues). */
function landmarks(built: Building[]): Building[] {
  return built.filter(
    (b) => b.kind === 'fountain' || b.kind === 'statue' || b.kind === 'greenhouse',
  );
}

/** A door point a touch in front of a building (toward the platform center). */
function doorPoint(b: Building, center: Vec2): Vec2 {
  const dx = center.x - b.position.x;
  const dz = center.z - b.position.z;
  const len = Math.hypot(dx, dz) || 1;
  // Stand ~1.1 units out from the footprint toward the center.
  return { x: b.position.x + (dx / len) * 1.1, z: b.position.z + (dz / len) * 1.1 };
}

/** Deterministic point inside the platform disc. */
function discPoint(d: District, key: string, salt: number): Vec2 {
  const a = hashFloat(key, salt) * Math.PI * 2;
  const r = Math.sqrt(hashFloat(key, salt + 1)) * Math.max(1.5, d.radius - 2.5);
  return { x: d.position.x + Math.cos(a) * r, z: d.position.z + Math.sin(a) * r };
}

/**
 * A point near the district edge (for fishing / stockpiles). Fishing wants the
 * waterline: when terrain exists the direction aims at the river; otherwise a
 * deterministic random direction (with a little jitter either way).
 */
function edgePoint(
  d: District,
  key: string,
  salt: number,
  terrain?: TerrainData,
  towardRiver = false,
): Vec2 {
  let a = hashFloat(key, salt) * Math.PI * 2;
  if (towardRiver && terrain) {
    const dir = riverDirectionFrom(terrain, d.position.x, d.position.z);
    if (dir) {
      a = Math.atan2(dir.z, dir.x) + (hashFloat(key, salt) - 0.5) * 0.8;
    }
  }
  const r = d.radius - 0.7;
  return { x: d.position.x + Math.cos(a) * r, z: d.position.z + Math.sin(a) * r };
}

/** How many townsfolk a district fields, scaling with population + development. */
function districtCount(d: District, crowdMul: number): number {
  if (d.development < 5) return 0;
  const byPopulation = d.population / 130;
  const devScale = 0.3 + (0.7 * d.development) / 100;
  const n = Math.round(byPopulation * devScale * crowdMul);
  return Math.max(1, Math.min(22, n));
}

// ----- Wardrobe assignment -------------------------------------------------

function pickClothes(id: string): string {
  return CLOTHES[Math.floor(hashFloat(id, 3) * CLOTHES.length)];
}
function pickSkin(id: string): string {
  return SKIN[Math.floor(hashFloat(id, 4) * SKIN.length)];
}

/**
 * Decide a citizen's role / activity for a district, plus wardrobe and prop.
 * Deterministic by id so the same person always plays the same part. The mix
 * is biased by district type and the city's mood (festive -> dancers, chaotic
 * -> protesters in old-town).
 */
function makeCitizen(
  d: District,
  built: Building[],
  marks: Building[],
  index: number,
  mood: City['mood'],
  terrain?: TerrainData,
): CitizenSpec {
  const id = `cit-${d.id}-${index}`;
  const center: Vec2 = d.position;
  const radius = Math.max(2, d.radius - 2.5);
  const roll = hashFloat(id, 1);
  const moodRoll = hashFloat(id, 2);

  const isWork = WORK_DISTRICTS.has(d.type);
  const isMarket = MARKET_DISTRICTS.has(d.type);
  const isMagical = MAGICAL_DISTRICTS.has(d.type);
  const isHarbor = d.type === 'harbor';

  let activity: Activity = 'errands';
  let hat: Hat = 'none';
  let prop: PropKind = 'none';
  let scale = 1;
  let speed = 0.95 + hashFloat(id, 6) * 0.5;
  let group: string | undefined;
  let points: Vec2[] = [];

  // --- Mood-driven crowd scenes take priority for a slice of the population.
  const festive = mood === 'festive';
  const chaotic = mood === 'chaotic';
  if (festive && marks.length > 0 && moodRoll < 0.32) {
    activity = 'dance';
    const mark = marks[Math.floor(hashFloat(id, 7) * marks.length)];
    group = `dance-${d.id}-${mark.id}`;
    points = [{ x: mark.position.x, z: mark.position.z }];
    speed = 1.1;
  } else if (chaotic && d.type === 'old-town' && moodRoll < 0.4) {
    activity = 'protest';
    group = `protest-${d.id}`;
    // Cluster around a deterministic rally point on the platform.
    points = [discPoint(d, d.id, 200)];
    speed = 0.5;
  } else {
    // --- Otherwise an activity that fits the district.
    if (roll < 0.14) {
      // Kids run loops / chase in pairs.
      activity = 'kid';
      scale = 0.6;
      speed = 1.7 + hashFloat(id, 6) * 0.6;
      group = `kid-${d.id}-${Math.floor(index / 2)}`; // pair up by adjacency
      points = [discPoint(d, id, 30), discPoint(d, id, 32), discPoint(d, id, 34)];
    } else if (isHarbor && roll < 0.34) {
      activity = 'fishing';
      prop = 'rod';
      speed = 0.7;
      // Fish from the bank facing the river (harbors hug the water now).
      points = [edgePoint(d, id, 40, terrain, true)];
    } else if (isWork && roll < 0.46) {
      activity = 'work';
      prop = hashFloat(id, 8) < 0.5 ? 'crate' : 'sack';
      speed = 0.85 + hashFloat(id, 6) * 0.3;
      // Two fixed haul endpoints (a building door and an edge stockpile).
      const a = built.length > 0 ? doorPoint(built[index % built.length], center) : discPoint(d, id, 50);
      points = [a, edgePoint(d, id, 52)];
    } else if (isMarket && roll < 0.6) {
      activity = 'market';
      speed = 0.8 + hashFloat(id, 6) * 0.4;
      // Hop between stall doors (or random spots if no stalls built yet).
      const stalls = built.filter((b) => b.kind === 'market-stall' || b.kind === 'tent');
      const pool = stalls.length > 0 ? stalls : built;
      points = pickPoints(pool, center, d, id, 3);
    } else if (marks.length > 0 && roll < 0.72) {
      activity = 'lounge';
      speed = 0.7;
      const mark = marks[Math.floor(hashFloat(id, 9) * marks.length)];
      // Sit a little out from the landmark.
      points = [doorPoint(mark, center)];
    } else if (roll < 0.84 && index % 5 === 0) {
      // A subset socialize: small converging groups.
      activity = 'social';
      group = `social-${d.id}-${Math.floor(index / 5)}`;
      points = [discPoint(d, group, 60)];
      speed = 0.85;
    } else {
      activity = 'errands';
      speed = 0.95 + hashFloat(id, 6) * 0.55;
      points = pickPoints(built, center, d, id, 3);
    }
  }

  // --- Wardrobe overlays (some deterministic by district flavor).
  let bodyColor = pickClothes(id);
  const skinColor = pickSkin(id);

  if (activity === 'kid') {
    bodyColor = KID_COLORS[Math.floor(hashFloat(id, 10) * KID_COLORS.length)];
  } else if (isMagical && hashFloat(id, 11) < 0.45) {
    // Mages near magical / academy districts: robe + wizard hat + staff.
    bodyColor = ROBE_COLORS[Math.floor(hashFloat(id, 12) * ROBE_COLORS.length)];
    hat = 'wizard';
    if (prop === 'none' && hashFloat(id, 13) < 0.7) prop = 'staff';
  } else if (d.type === 'academy' && hashFloat(id, 14) < 0.4) {
    bodyColor = SCHOLAR_COLORS[Math.floor(hashFloat(id, 15) * SCHOLAR_COLORS.length)];
    hat = 'scholar';
  } else if (d.type === 'garden' && hashFloat(id, 16) < 0.5) {
    hat = 'sunhat';
  }

  // Ensure every activity has at least one point to aim at.
  if (points.length === 0) points = [discPoint(d, id, 70)];

  return { id, districtId: d.id, activity, center, radius, points, group, bodyColor, skinColor, hat, prop, scale, speed };
}

/** Pick up to `n` deterministic anchor points from buildings (or disc fallback). */
function pickPoints(
  pool: Building[],
  center: Vec2,
  d: District,
  id: string,
  n: number,
): Vec2[] {
  const pts: Vec2[] = [];
  if (pool.length === 0) {
    for (let i = 0; i < n; i++) pts.push(discPoint(d, id, 80 + i * 2));
    return pts;
  }
  for (let i = 0; i < n; i++) {
    const b = pool[Math.floor(hashFloat(id, 90 + i) * pool.length)];
    pts.push(doorPoint(b, center));
  }
  return pts;
}

/** Build night-watch patrol pairs for the city (deterministic, capped). */
function makePatrols(d: District, built: Building[], startIndex: number): CitizenSpec[] {
  // One slow patrol pair per developed district.
  if (d.development < 30) return [];
  const out: CitizenSpec[] = [];
  const ring: Vec2[] = [];
  // A circuit of 4 waypoints around the platform.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + hashFloat(d.id, 300) * Math.PI;
    const r = Math.max(2, d.radius - 2.2);
    ring.push({ x: d.position.x + Math.cos(a) * r, z: d.position.z + Math.sin(a) * r });
  }
  for (let p = 0; p < 2; p++) {
    const id = `watch-${d.id}-${startIndex}-${p}`;
    out.push({
      id,
      districtId: d.id,
      activity: 'patrol',
      center: d.position,
      radius: Math.max(2, d.radius - 2.2),
      points: ring,
      group: `watch-${d.id}-${startIndex}`,
      bodyColor: WATCH_COLOR,
      skinColor: pickSkin(id),
      hat: 'watch',
      prop: 'none',
      scale: 1.04,
      speed: 0.6,
    });
  }
  void built;
  return out;
}

/**
 * Build the guaranteed instance for a named cast member (phase 06). It plays a
 * natural, district-appropriate role (so it walks real routes and blends in),
 * but carries `castId` so the renderer can mark it, raycast back to it, and the
 * follow camera can read its position. Deterministic: a stable salt derived
 * from the cast id seeds its role so two cast members in one district never
 * collapse onto an identical look. Pure renderer binding — no simulation touch.
 */
function makeCastCitizen(
  c: NotableCitizen,
  d: District,
  built: Building[],
  marks: Building[],
  terrain?: TerrainData,
): CitizenSpec {
  // A stable pseudo-index off the cast id keeps the role/wardrobe varied and
  // collision-free without depending on the (fluctuating) crowd size.
  const salt = 1 + Math.floor(hashFloat(c.id, 1) * 9973);
  // Pass a neutral 'serene' mood: cast members keep a steady district role and
  // never get swept into a transient festive/chaotic crowd-scene (a follow
  // target that teleports into a dance orbit reads as a glitch).
  const base = makeCitizen(d, built, marks, salt, 'serene', terrain);
  // Named citizens read as adults: a 'kid' role at adult scale looks wrong, so
  // promote it to an errand-runner (keeping a real walking route).
  if (base.activity === 'kid') {
    base.activity = 'errands';
    base.group = undefined;
  }
  return {
    ...base,
    id: `castcit-${c.id}`,
    districtId: d.id,
    castId: c.id,
    scale: Math.max(base.scale, 1) * 1.06, // a touch taller so they stand out
  };
}

/**
 * @param quality 0..1 crowd-density factor from the adaptive perf governor
 *   (1 = full crowd). Scales both the per-district count and the global cap, so
 *   a struggling GPU fields fewer townsfolk without changing anyone's role.
 *   Cast members are still bound first, so thinning never drops a named citizen.
 */
export function buildSpecs(city: City, quality = 1): CrowdSpecs {
  const crowdMul = moodCrowdMultiplier(city.mood) * quality;
  const citizens: CitizenSpec[] = [];

  // Phase 06 — bind named cast members first so the proportional cap never
  // drops them: a cast member must reliably exist whenever their home district
  // does. Group them by home district to reuse each district's built roster.
  const castByDistrict = new Map<string, NotableCitizen[]>();
  for (const c of city.cast ?? []) {
    const arr = castByDistrict.get(c.homeDistrictId);
    if (arr) arr.push(c);
    else castByDistrict.set(c.homeDistrictId, [c]);
  }

  for (const d of city.districts) {
    const built = builtBuildings(d);
    const marks = landmarks(built);
    // Guaranteed cast instances for this district (only when developed enough
    // to field anyone at all — matches districtCount's floor so a brand-new
    // district isn't a lone figure on bare ground).
    if (d.development >= 5) {
      for (const c of castByDistrict.get(d.id) ?? []) {
        citizens.push(makeCastCitizen(c, d, built, marks, city.terrain));
      }
    }
    const n = districtCount(d, crowdMul);
    for (let i = 0; i < n; i++) {
      citizens.push(makeCitizen(d, built, marks, i, city.mood, city.terrain));
    }
    // Night-watch patrols when safety is a concern or simply as flavor at night.
    if (city.stats.safety < 70 || d.type === 'old-town') {
      for (const w of makePatrols(d, built, 0)) citizens.push(w);
    }
  }

  // Proportionally trim toward the target before the hard cap. We keep a stable
  // prefix so ids don't churn frame-to-frame; districts are already in a stable
  // order, so a simple slice is deterministic. Cast instances are pushed at the
  // head of each district's block, so the slice never strands a named citizen.
  // The quality factor scales the cap too (≥1 cast member is always kept).
  const cap = Math.round(Math.min(MAX_CITIZENS, Math.max(TARGET_CITIZENS, 0) + 30) * quality);
  const limited = citizens.slice(0, Math.max(1, cap));

  // ----- Carts on the road ribbons -----------------------------------------
  const carts: CartSpec[] = [];
  const byId = new Map(city.districts.map((d) => [d.id, d]));
  for (const road of city.roads) {
    if (carts.length >= MAX_CARTS) break;
    const a = byId.get(road.from);
    const b = byId.get(road.to);
    if (!a || !b) continue;
    const len = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
    const tMin = (a.radius + 1.0) / len;
    const tMax = 1 - (b.radius + 1.0) / len;
    if (tMax - tMin < 0.12) continue;
    // Only busier roads (developed endpoints) get a cart, deterministically.
    const dev = (a.development + b.development) / 2;
    const roll = hashFloat(`cart-${road.from}-${road.to}`, 1);
    if (dev < 22 || roll > 0.6) continue;
    carts.push({
      id: `cart-${road.from}-${road.to}`,
      curve: roadCurve(a.position, b.position),
      tMin,
      tMax,
      bodyColor: CART_WOODS[Math.floor(hashFloat(`cart-${road.from}-${road.to}`, 2) * CART_WOODS.length)],
      speed: 1.4 + roll * 0.6,
    });
  }

  return { citizens: limited, carts };
}
