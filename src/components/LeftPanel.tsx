import { useEffect, useState } from 'react';
import type { City } from '../types';
import { useGameStore } from '../state/store';
import { CityTab } from './CityTab';
import { DistrictsTab } from './DistrictsTab';
import { FactionsTab } from './FactionsTab';

type TabKey = 'city' | 'districts' | 'factions';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'city', label: 'City' },
  { key: 'districts', label: 'Districts' },
  { key: 'factions', label: 'Factions' },
];

export function LeftPanel({ city }: { city: City }) {
  const [tab, setTab] = useState<TabKey>('city');
  const selectedDistrictId = useGameStore((s) => s.selectedDistrictId);
  const selectedFactionId = useGameStore((s) => s.selectedFactionId);

  // Follow selections made elsewhere (e.g. clicking a district in the 3D map)
  // so the relevant detail is always visible.
  useEffect(() => {
    if (selectedDistrictId) setTab('districts');
  }, [selectedDistrictId]);
  useEffect(() => {
    if (selectedFactionId) setTab('factions');
  }, [selectedFactionId]);

  return (
    <aside className="leftpanel mm-panel">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`tab${tab === t.key ? ' tab--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tabbody mm-scroll">
        {tab === 'city' && <CityTab city={city} />}
        {tab === 'districts' && <DistrictsTab city={city} />}
        {tab === 'factions' && <FactionsTab city={city} />}
      </div>
    </aside>
  );
}
