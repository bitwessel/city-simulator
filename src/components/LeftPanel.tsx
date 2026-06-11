import { useEffect, useState } from 'react';
import type { City } from '../types';
import { useGameStore } from '../state/store';
import { CityTab } from './CityTab';
import { DistrictsTab } from './DistrictsTab';
import { FactionsTab } from './FactionsTab';

type TabKey = 'city' | 'districts' | 'factions';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'city', label: 'City', icon: '🏰' },
  { key: 'districts', label: 'Districts', icon: '🗺️' },
  { key: 'factions', label: 'Factions', icon: '⚖️' },
];

export function LeftPanel({ city }: { city: City }) {
  const [tab, setTab] = useState<TabKey>('city');
  const [collapsed, setCollapsed] = useState(false);
  const selectedDistrictId = useGameStore((s) => s.selectedDistrictId);
  const selectedFactionId = useGameStore((s) => s.selectedFactionId);

  // Follow selections made elsewhere (e.g. clicking a district in the 3D map)
  // so the relevant detail is always visible — and pop the panel open for it.
  useEffect(() => {
    if (selectedDistrictId) {
      setTab('districts');
      setCollapsed(false);
    }
  }, [selectedDistrictId]);
  useEffect(() => {
    if (selectedFactionId) {
      setTab('factions');
      setCollapsed(false);
    }
  }, [selectedFactionId]);

  // Collapsed state: a slim icon rail. Clicking an icon reopens that tab.
  if (collapsed) {
    return (
      <aside className="railpanel mm-panel mm-panel--gloss" aria-label="City panel (collapsed)">
        <button
          className="rail__btn rail__btn--expand"
          onClick={() => setCollapsed(false)}
          title="Expand panel"
          aria-label="Expand panel"
        >
          »
        </button>
        <div className="rail__divider" />
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`rail__btn${tab === t.key ? ' rail__btn--active' : ''}`}
            onClick={() => {
              setTab(t.key);
              setCollapsed(false);
            }}
            title={t.label}
            aria-label={t.label}
          >
            {t.icon}
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside className="leftpanel mm-panel mm-panel--gloss">
      <div className="leftpanel__head">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={`tab${tab === t.key ? ' tab--active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <span className="tab__icon">{t.icon}</span>
              <span className="tab__label">{t.label}</span>
            </button>
          ))}
        </div>
        <button
          className="leftpanel__collapse"
          onClick={() => setCollapsed(true)}
          title="Collapse panel"
          aria-label="Collapse panel"
        >
          «
        </button>
      </div>
      <div className="tabbody mm-scroll">
        {tab === 'city' && <CityTab city={city} />}
        {tab === 'districts' && <DistrictsTab city={city} />}
        {tab === 'factions' && <FactionsTab city={city} />}
      </div>
    </aside>
  );
}
