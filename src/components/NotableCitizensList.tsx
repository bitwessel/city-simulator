import type { District, NotableCitizen } from '../types';
import { useGameStore } from '../state/store';
import { DISTRICT_TYPE_META } from './statMeta';

// ---------------------------------------------------------------------------
// "Notable citizens" list (phase 06). A small roster of the named cast. Used in
// the City tab (whole cast) and the district detail (that district's members).
// Clicking a row opens the same bio card the 3D click opens. Pure UI.
// ---------------------------------------------------------------------------

export function NotableCitizensList({
  citizens,
  districts,
  showDistrict = true,
  emptyNote = 'No notable citizens here yet.',
}: {
  citizens: NotableCitizen[];
  districts: District[];
  /** Show each citizen's home district (off when the list is already scoped). */
  showDistrict?: boolean;
  emptyNote?: string;
}) {
  const selectCast = useGameStore((s) => s.selectCast);
  const selectedCastId = useGameStore((s) => s.selectedCastId);

  if (citizens.length === 0) {
    return <p className="empty-note">{emptyNote}</p>;
  }

  return (
    <div className="citizen-list">
      {citizens.map((c) => {
        const district = showDistrict
          ? districts.find((d) => d.id === c.homeDistrictId)
          : null;
        const typeMeta = district ? DISTRICT_TYPE_META[district.type] : null;
        const isSel = c.id === selectedCastId;
        return (
          <button
            key={c.id}
            className={`citizen-row${isSel ? ' citizen-row--selected' : ''}`}
            onClick={() => selectCast(isSel ? null : c.id)}
            title={c.personality}
          >
            <span className="citizen-row__avatar" aria-hidden>
              🧑
            </span>
            <span className="citizen-row__body">
              <span className="citizen-row__name">{c.name}</span>
              <span className="citizen-row__sub">
                {c.archetype}
                {district && (
                  <>
                    {' · '}
                    {typeMeta?.icon} {district.name}
                  </>
                )}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
