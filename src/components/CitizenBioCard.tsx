import type { City } from '../types';
import { useGameStore } from '../state/store';
import { DISTRICT_TYPE_META } from './statMeta';

// ---------------------------------------------------------------------------
// Citizen bio card (phase 06). A small floating card for a notable citizen:
// name, archetype, one-line personality, home district, and a Follow toggle.
// Opened by clicking the citizen in the 3D world or their entry in the
// "Notable citizens" lists. Pure UI — reads selection from the store, mutates
// no City data. The card itself floats over the canvas (mounted by CityScene)
// so it works regardless of the side panel's layout.
// ---------------------------------------------------------------------------

export function CitizenBioCard({ city }: { city: City }) {
  const selectedCastId = useGameStore((s) => s.selectedCastId);
  const selectCast = useGameStore((s) => s.selectCast);
  const followedCastId = useGameStore((s) => s.followedCastId);
  const followCast = useGameStore((s) => s.followCast);

  const cast = selectedCastId
    ? (city.cast ?? []).find((c) => c.id === selectedCastId)
    : null;
  if (!cast) return null;

  const district = city.districts.find((d) => d.id === cast.homeDistrictId);
  const typeMeta = district ? DISTRICT_TYPE_META[district.type] : null;
  const following = followedCastId === cast.id;

  return (
    <div className="biocard mm-panel mm-panel--gloss" role="dialog" aria-label={`About ${cast.name}`}>
      <button
        className="biocard__close"
        onClick={() => selectCast(null)}
        title="Close"
        aria-label="Close"
      >
        ✕
      </button>

      <div className="biocard__avatar" aria-hidden>
        🧑
      </div>
      <h3 className="biocard__name">{cast.name}</h3>
      <div className="biocard__archetype">
        {cast.archetype}
        {district && (
          <>
            {' · '}
            <button
              className="biocard__district"
              onClick={() => useGameStore.getState().selectDistrict(district.id)}
              title={`Go to ${district.name}`}
            >
              {typeMeta?.icon} {district.name}
            </button>
          </>
        )}
      </div>

      <p className="biocard__personality">“{cast.personality}”</p>

      <div className="biocard__actions">
        <button
          className={`mm-btn biocard__follow${following ? ' biocard__follow--on' : ''}`}
          onClick={() => followCast(following ? null : cast.id)}
        >
          {following ? '◉ Following — release' : '🎥 Follow'}
        </button>
      </div>
    </div>
  );
}
