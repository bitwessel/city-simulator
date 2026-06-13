import { validateWorld, type WorldValidationResult } from './validate';

// ---------------------------------------------------------------------------
// Curated-world registry (phase 07). Discovery is a Vite glob over the
// checked-in `worlds/<id>/world.json` files plus their optional `preview.png`,
// so it works the same in the app build, in Vitest, and under vite-node — no
// generated manifest to keep in sync. Each world is validated up front; a
// broken file still appears in the list with its validation errors so the
// picker can show a friendly message instead of crashing.
// ---------------------------------------------------------------------------

export interface WorldEntry {
  id: string;
  /** Resolved URL of the world's `preview.png`, or null if it has none. */
  previewUrl: string | null;
  /** The validation result — `ok: true` worlds are loadable, the rest report why. */
  result: WorldValidationResult;
}

// Eagerly import every world.json as a parsed object, and every preview.png as
// a URL string. The keys are absolute glob paths like
// `/worlds/saltmarsh-harbor/world.json`.
const WORLD_JSON = import.meta.glob('/worlds/*/world.json', {
  eager: true,
}) as Record<string, { default: unknown }>;

const PREVIEW_URLS = import.meta.glob('/worlds/*/preview.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Pull the `<id>` folder name out of a `/worlds/<id>/<file>` glob key. */
function idFromPath(path: string): string {
  const match = path.match(/\/worlds\/([^/]+)\//);
  return match ? match[1] : path;
}

let cache: WorldEntry[] | null = null;

function buildEntries(): WorldEntry[] {
  const previewById = new Map<string, string>();
  for (const [path, url] of Object.entries(PREVIEW_URLS)) {
    previewById.set(idFromPath(path), url);
  }

  const entries: WorldEntry[] = [];
  for (const [path, mod] of Object.entries(WORLD_JSON)) {
    const id = idFromPath(path);
    // A glob-imported JSON module exposes the parsed object as `default`.
    const raw = (mod && typeof mod === 'object' && 'default' in mod) ? mod.default : mod;
    entries.push({
      id,
      previewUrl: previewById.get(id) ?? null,
      result: validateWorld(raw),
    });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

/** Every world found on disk, each paired with its validation result. */
export function listWorlds(): WorldEntry[] {
  if (!cache) cache = buildEntries();
  return cache;
}

/** Look up one world entry by id, or undefined if no such folder exists. */
export function getWorld(id: string): WorldEntry | undefined {
  return listWorlds().find((e) => e.id === id);
}
