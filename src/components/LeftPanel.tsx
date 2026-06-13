import { useEffect, useState } from 'react';
import type { City } from '../types';
import { useGameStore } from '../state/store';
import { CityTab } from './CityTab';
import { DistrictsTab } from './DistrictsTab';
import { FactionsTab } from './FactionsTab';
import { ChronicleTab } from './ChronicleTab';
import { MOBILE_QUERY, useMediaQuery } from './useMediaQuery';

type TabKey = 'city' | 'districts' | 'factions' | 'chronicle';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'city', label: 'City', icon: '🏰' },
  { key: 'districts', label: 'Districts', icon: '🗺️' },
  { key: 'factions', label: 'Factions', icon: '⚖️' },
  { key: 'chronicle', label: 'Chronicle', icon: '📜' },
];

/** The tab strip, shared by the docked desktop panel and the mobile sheet. */
function TabStrip({ tab, setTab }: { tab: TabKey; setTab: (t: TabKey) => void }) {
  return (
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
  );
}

/** The body for the active tab, shared by both layouts. */
function TabBody({ tab, city }: { tab: TabKey; city: City }) {
  return (
    <>
      {tab === 'city' && <CityTab city={city} />}
      {tab === 'districts' && <DistrictsTab city={city} />}
      {tab === 'factions' && <FactionsTab city={city} />}
      {tab === 'chronicle' && <ChronicleTab city={city} />}
    </>
  );
}

export function LeftPanel({ city }: { city: City }) {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [tab, setTab] = useState<TabKey>('city');
  const [collapsed, setCollapsed] = useState(false);
  const selectedDistrictId = useGameStore((s) => s.selectedDistrictId);
  const selectedFactionId = useGameStore((s) => s.selectedFactionId);
  const panelOpen = useGameStore((s) => s.panelOpen);
  const setPanelOpen = useGameStore((s) => s.setPanelOpen);

  // Follow selections made elsewhere (e.g. clicking a district in the 3D map)
  // so the relevant detail is always visible — and pop the panel open for it.
  // (The store also flips panelOpen on selection for the mobile sheet.)
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

  // Mobile: the panel lives in a slide-up popup launched from the top bar, so
  // the 3D city owns the whole screen until summoned.
  if (isMobile) {
    if (!panelOpen) return null;
    return (
      <div className="sheet-backdrop" onClick={() => setPanelOpen(false)}>
        <aside
          className="leftpanel leftpanel--sheet mm-panel mm-panel--gloss"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="City panel"
        >
          <div className="leftpanel__head">
            <TabStrip tab={tab} setTab={setTab} />
            <button
              className="leftpanel__collapse"
              onClick={() => setPanelOpen(false)}
              title="Close panel"
              aria-label="Close panel"
            >
              ✕
            </button>
          </div>
          <div className="tabbody mm-scroll">
            <TabBody tab={tab} city={city} />
          </div>
        </aside>
      </div>
    );
  }

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
      <div className="leftpanel__chrome">
        <button
          className="leftpanel__hide"
          onClick={() => setCollapsed(true)}
          title="Collapse panel"
          aria-label="Collapse panel"
        >
          <span className="leftpanel__hide-ico" aria-hidden>
            «
          </span>
          Collapse
        </button>
      </div>
      <div className="leftpanel__tabs">
        <TabStrip tab={tab} setTab={setTab} />
      </div>
      <div className="tabbody mm-scroll">
        <TabBody tab={tab} city={city} />
      </div>
    </aside>
  );
}
