import { useState } from 'react';
import type { ActiveProject, City, District, ProjectDef } from '../types';
import { useGameStore } from '../state/store';
import {
  PROJECTS_PER_DISTRICT,
  canStartProject,
  districtProjectCount,
  getFavor,
  getProjectDef,
} from '../projects/projects';
import { PROJECT_POOL } from '../projects/data/projects';
import { EffectChips, buildEffectChips } from './EffectChips';

// ---------------------------------------------------------------------------
// "Commission a project" — the relaxed-authorship verb in the district panel.
// Lists landmarks the player can pull into being (no push, no countdowns, no
// nagging), shows what's currently going up, and remembers finished landmarks
// with quiet pride. All game logic lives in src/projects/; this only renders
// and dispatches the existing startProject store action.
// ---------------------------------------------------------------------------

/** Effect chips for a project def: completion stats, district + faction nudges. */
function projectChips(def: ProjectDef) {
  return buildEffectChips({
    effects: def.completionEffects,
    districtEffects: def.districtEffects,
    factionEffects: def.factionEffects,
  });
}

/**
 * A soft, no-pressure phrasing for how a build is coming along. Deliberately
 * vague near the end (no ticking number in your face) and never a progress bar.
 */
function progressFlavor(city: City, active: ActiveProject): string {
  const remaining = active.completeDay - city.day;
  if (remaining <= 0) return 'The works are wrapping up — any day now.';
  if (remaining <= 2) return 'Nearly there — just the finishing touches.';
  if (remaining <= 5) return 'A few days to go.';
  return 'The works are well underway.';
}

/** One commissionable project: name, flavor, cost/time, chips, commission button. */
function ProjectOption({
  city,
  district,
  def,
}: {
  city: City;
  district: District;
  def: ProjectDef;
}) {
  const startProject = useGameStore((s) => s.startProject);
  const [confirming, setConfirming] = useState(false);

  const check = canStartProject(city, district.id, def.id);
  const chips = projectChips(def);

  return (
    <div className="project-opt">
      <div className="project-opt__head">
        <span className="project-opt__name">{def.name}</span>
        <span className="project-opt__cost" title="City Favor this project asks of the council">
          ✦ {def.cost}
        </span>
      </div>
      <p className="project-opt__flavor">{def.flavor}</p>
      <div className="project-opt__meta">
        <span title="Roughly how long the works will take">
          🛠️ ~{def.buildDays} days to build
        </span>
      </div>
      <EffectChips chips={chips} />

      {confirming && check.ok ? (
        <div className="project-opt__confirm">
          <span className="project-opt__confirm-q">Break ground in {district.name}?</span>
          <div className="project-opt__confirm-btns">
            <button
              className="mm-btn mm-btn--brass project-opt__go"
              onClick={() => {
                startProject(district.id, def.id);
                setConfirming(false);
              }}
            >
              Commission it
            </button>
            <button className="mm-btn project-opt__cancel" onClick={() => setConfirming(false)}>
              Not yet
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            className="mm-btn project-opt__start"
            disabled={!check.ok}
            onClick={() => setConfirming(true)}
          >
            {check.ok ? 'Commission' : 'Not yet'}
          </button>
          {!check.ok && <span className="project-opt__reason">{check.reason}</span>}
        </>
      )}
    </div>
  );
}

export function CommissionSection({ city, district }: { city: City; district: District }) {
  // Projects already standing or rising here, in build order — listed with pride.
  const active = (city.activeProjects ?? []).filter((p) => p.districtId === district.id);
  const completed = (city.completedProjects ?? []).filter((p) => p.districtId === district.id);

  // Eligible = the catalog filtered by this district's own rules. We render the
  // full catalog with their reasons so the player can see what *could* go here
  // (and why something is greyed out), rather than a bare "nothing available".
  // Only the ones valid for this district type are worth showing as options.
  const offerable = PROJECT_POOL.filter((def) => {
    if (canStartProject(city, district.id, def.id).ok) return true;
    // Keep "saving up favor" and "district is full" cases visible as teasers,
    // but hide projects that simply can't be built in this district type or are
    // already here — those aren't useful "you could build this" prompts.
    const allowed = def.districtTypes === 'any' || def.districtTypes.includes(district.type);
    if (!allowed) return false;
    const alreadyHere =
      active.some((p) => p.defId === def.id) || completed.some((p) => p.defId === def.id);
    return !alreadyHere;
  });

  const favor = Math.floor(getFavor(city));
  const atCap = districtProjectCount(city, district.id) >= PROJECTS_PER_DISTRICT;

  return (
    <section className="commission">
      <h4 className="section__title" style={{ marginTop: 12 }}>
        Mayor&apos;s Projects
      </h4>

      {(active.length > 0 || completed.length > 0) && (
        <div className="commission__standing">
          {active.map((p) => {
            const def = getProjectDef(p.defId);
            if (!def) return null;
            return (
              <div className="project-live project-live--building" key={p.buildingId}>
                <div className="project-live__name">🏗️ {def.name}</div>
                <div className="project-live__note">{progressFlavor(city, p)}</div>
              </div>
            );
          })}
          {completed.map((p, i) => {
            const def = getProjectDef(p.defId);
            if (!def) return null;
            return (
              <div className="project-live project-live--done" key={`${p.defId}-${i}`}>
                <div className="project-live__name">✦ {def.name}</div>
                <div className="project-live__note">Standing proud since day {p.day}.</div>
              </div>
            );
          })}
        </div>
      )}

      <p className="commission__lead">
        {atCap
          ? `${district.name} is wonderfully full of landmarks. No rush to add more.`
          : `Spend City Favor to raise something lovely here. You have ✦ ${favor} banked — it refills on its own, faster when the city adores you.`}
      </p>

      {offerable.length === 0 ? (
        <p className="empty-note">
          No projects suit this corner of town just now — but the catalog grows with the city.
        </p>
      ) : (
        <div className="commission__list">
          {offerable.map((def) => (
            <ProjectOption key={def.id} city={city} district={district} def={def} />
          ))}
        </div>
      )}
    </section>
  );
}
