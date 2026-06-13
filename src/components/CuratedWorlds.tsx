import { useState } from 'react';
import { listWorlds } from '../worlds/registry';
import { useGameStore } from '../state/store';

/**
 * Phase 07 — Curated Worlds gallery. Rendered below the "Create New City"
 * flow on the Start screen. Shows one card per valid world (with preview
 * image, name, and blurb) plus friendly error chips for broken world files.
 * Clicking a card loads the world immediately — no founding ritual needed.
 */
export function CuratedWorlds() {
  const beginWorld = useGameStore((s) => s.beginWorld);
  const [variationSeed, setVariationSeed] = useState('');

  const worlds = listWorlds();
  if (worlds.length === 0) return null;

  const okWorlds = worlds.filter((e) => e.result.ok);
  const badWorlds = worlds.filter((e) => !e.result.ok);

  return (
    <section className="start__worlds">
      <div className="start__worlds-header">
        <h2 className="start__worlds-heading">Curated Worlds</h2>
        <p className="start__worlds-intro">
          Or step into a world someone built by hand — every district, faction,
          and founding legend placed with intent.
        </p>
      </div>

      {okWorlds.length > 0 && (
        <>
          <div className="start__worlds-grid">
            {okWorlds.map((entry) => {
              if (!entry.result.ok) return null; // type guard
              const { world } = entry.result;
              const blurb = world.lore?.blurb ?? world.lore?.tagline ?? null;
              return (
                <button
                  key={entry.id}
                  className="start__world-card mm-panel--gloss"
                  onClick={() => beginWorld(entry.id, variationSeed)}
                  title={`Load ${world.name}`}
                >
                  <div className="start__world-preview">
                    {entry.previewUrl ? (
                      <img
                        src={entry.previewUrl}
                        alt={`Preview of ${world.name}`}
                        className="start__world-img"
                      />
                    ) : (
                      <div className="start__world-placeholder" aria-hidden>
                        🏙️
                      </div>
                    )}
                  </div>
                  <div className="start__world-info">
                    <span className="start__world-name">{world.name}</span>
                    {blurb && (
                      <span className="start__world-blurb">{blurb}</span>
                    )}
                    <span className="start__world-cta mm-btn mm-btn--brass">
                      Enter World
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <label className="start__worlds-seed">
            <span className="start__seed-label">Variation Seed</span>
            <input
              className="start__seed-input start__worlds-seed-input"
              type="text"
              value={variationSeed}
              placeholder="Optional — changes generated details, keeps the author's intent…"
              onChange={(e) => setVariationSeed(e.target.value)}
              maxLength={48}
            />
          </label>
          <p className="start__hint">
            Leave blank for the author's canonical version.
          </p>
        </>
      )}

      {badWorlds.length > 0 && (
        <ul className="start__worlds-errors" aria-label="Broken world files">
          {badWorlds.map((entry) => {
            const firstError =
              !entry.result.ok ? entry.result.errors[0] : 'unknown error';
            return (
              <li key={entry.id} className="start__world-error-chip">
                <span className="start__world-error-id">{entry.id}</span>
                <span className="start__world-error-msg">{firstError}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
