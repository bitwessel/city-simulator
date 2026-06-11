import { useEffect, useMemo, useRef, useState } from 'react';
import type { City, NewsItem } from '../types';
import { NEWS_TONE_COLOR } from './statMeta';

const TONE_ICON: Record<NewsItem['tone'], string> = {
  good: '🌟',
  bad: '⚠️',
  weird: '🔮',
  neutral: '📰',
};

/** A transient headline currently shown in the ticker, with a stable key. */
interface Toast {
  key: string;
  item: NewsItem;
}

/**
 * News, redesigned. Instead of a permanent full-height feed, the latest few
 * headlines surface as an unobtrusive auto-fading ticker in the bottom-right.
 * A "Chronicle" button opens the full scrollable history in a drawer.
 */
export function NewsFeed({ city }: { city: City }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Track how far into the log we've already surfaced so only *new* headlines
  // pop as toasts (and never on the very first render of a loaded city).
  const seenRef = useRef<number | null>(null);
  // Remount-safe per-headline key counter.
  const idRef = useRef(0);

  useEffect(() => {
    const len = city.news.length;
    if (seenRef.current === null) {
      // First sighting of this city: prime the marker, surface nothing.
      seenRef.current = len;
      return;
    }
    if (len <= seenRef.current) {
      // News got shorter (new game) — re-prime, drop stale toasts.
      if (len < seenRef.current) {
        seenRef.current = len;
        setToasts([]);
      }
      return;
    }
    // Surface up to the 3 newest fresh headlines.
    const fresh = city.news.slice(seenRef.current).slice(-3);
    seenRef.current = len;
    if (fresh.length === 0) return;
    const newToasts = fresh.map((item) => ({ key: `t${idRef.current++}`, item }));
    setToasts((prev) => [...prev, ...newToasts].slice(-3));
  }, [city.news]);

  // Auto-expire toasts ~6s after they appear.
  useEffect(() => {
    if (toasts.length === 0) return;
    const oldest = toasts[0];
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.key !== oldest.key));
    }, 6000);
    return () => clearTimeout(timer);
  }, [toasts]);

  // Newest-first full chronicle for the drawer.
  const chronicle = useMemo(
    () => city.news.map((item, idx) => ({ item, idx })).slice().reverse(),
    [city.news],
  );

  return (
    <>
      {/* Auto-fading ticker stack, bottom-right. */}
      <div className="ticker" aria-live="polite">
        {toasts.map(({ key, item }) => {
          const color = NEWS_TONE_COLOR[item.tone];
          return (
            <button
              key={key}
              className="ticker-toast"
              style={{ borderLeftColor: color }}
              onClick={() => setDrawerOpen(true)}
              title="Open the full chronicle"
            >
              <span className="ticker-toast__icon" style={{ color }}>
                {TONE_ICON[item.tone]}
              </span>
              <span className="ticker-toast__body">
                <span className="ticker-toast__day">Day {item.day}</span>
                <span className="ticker-toast__text">{item.text}</span>
              </span>
            </button>
          );
        })}
        <button
          className="chronicle-btn"
          onClick={() => setDrawerOpen(true)}
          title="Read the full chronicle"
        >
          📜 Chronicle
          {city.news.length > 0 && <span className="chronicle-btn__count">{city.news.length}</span>}
        </button>
      </div>

      {/* Full scrollable chronicle drawer. */}
      {drawerOpen && (
        <div className="newsdrawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <aside
            className="newsdrawer mm-panel mm-panel--gloss"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="City chronicle"
          >
            <div className="newsdrawer__head">
              <div className="newsdrawer__title">📜 The {city.name} Chronicle</div>
              <button
                className="newsdrawer__close"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close chronicle"
              >
                ✕
              </button>
            </div>
            <div className="newsdrawer__list mm-scroll">
              {chronicle.length === 0 ? (
                <p className="empty-note">No news yet. Enjoy the quiet.</p>
              ) : (
                chronicle.map(({ item, idx }) => {
                  const color = NEWS_TONE_COLOR[item.tone];
                  return (
                    <article
                      key={`${item.day}-${idx}`}
                      className="news-item"
                      style={{ borderLeftColor: color }}
                    >
                      <div className="news-item__day">
                        {TONE_ICON[item.tone]} Day {item.day}
                      </div>
                      <div className="news-item__text">{item.text}</div>
                    </article>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
