import { useEffect } from 'react';
import type { City } from '../types';
import { EDICT_POOL } from '../simulation/data/edicts';
import { canDeclareEdict, edictCooldownRemaining } from '../simulation/edicts';
import { buildEffectChips, EffectChips } from './EffectChips';

// ---------------------------------------------------------------------------
// Proclamations — the standing-edict control panel.
//
// Shows the current edict (or "No standing edict"), cooldown state, and the
// full list of edicts with effect chips and a Declare button. Mirrors the
// CityVitals popup pattern from TopBar.tsx.
// ---------------------------------------------------------------------------

export function Proclamations({
  city,
  onClose,
  onDeclare,
}: {
  city: City;
  onClose: () => void;
  onDeclare: (edictId: string | null) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cooldown = edictCooldownRemaining(city);
  const activeId = city.activeEdict ?? null;
  const activeDef = activeId ? EDICT_POOL.find((e) => e.id === activeId) : null;

  return (
    <div
      className="proclamations mm-panel mm-panel--gloss"
      role="dialog"
      aria-label="Proclamations"
    >
      <div className="proclamations__head">
        <h3 className="proclamations__title">Proclamations</h3>
        <button className="vitals-pop__close" onClick={onClose} aria-label="Close proclamations">
          ✕
        </button>
      </div>

      <div className="proclamations__status">
        {activeDef ? (
          <>
            <span className="proclamations__active-label">Current edict:</span>
            <span className="proclamations__active-name">{activeDef.name}</span>
          </>
        ) : (
          <span className="proclamations__active-none">No standing edict</span>
        )}
        {cooldown > 0 && (
          <p className="proclamations__cooldown">
            {`The council is still hanging the bunting from your last proclamation (${cooldown} more day${cooldown === 1 ? '' : 's'}).`}
          </p>
        )}
      </div>

      {activeDef && (
        <blockquote className="proclamations__proclamation">
          {activeDef.proclamation.replaceAll('{city}', city.name)}
        </blockquote>
      )}

      <ul className="proclamations__list">
        {EDICT_POOL.map((def) => {
          const isActive = def.id === activeId;
          const canResult = canDeclareEdict(city, def.id);
          const chips = buildEffectChips({
            effects: def.dailyEffects,
            factionEffects: def.factionReactions,
          });
          return (
            <li key={def.id} className={`proclamations__item${isActive ? ' proclamations__item--active' : ''}`}>
              <div className="proclamations__item-head">
                <span className="proclamations__item-name">{def.name}</span>
                <button
                  className="proclamations__declare-btn mm-btn mm-btn--sm"
                  disabled={!canResult.ok}
                  title={canResult.ok ? `Declare ${def.name}` : canResult.reason}
                  onClick={() => onDeclare(def.id)}
                >
                  {isActive ? 'Active' : 'Declare'}
                </button>
              </div>
              <p className="proclamations__item-blurb">{def.blurb}</p>
              <EffectChips chips={chips} />
            </li>
          );
        })}
      </ul>

      {activeDef && (
        <div className="proclamations__lift">
          <button
            className="proclamations__lift-btn mm-btn mm-btn--sm mm-btn--ghost"
            disabled={!canDeclareEdict(city, null).ok}
            title={(() => {
              const r = canDeclareEdict(city, null);
              return r.ok ? 'Lift the current edict' : r.reason;
            })()}
            onClick={() => onDeclare(null)}
          >
            Lift edict
          </button>
        </div>
      )}
    </div>
  );
}
