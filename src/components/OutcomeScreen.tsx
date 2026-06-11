import type { BoundedStatKey, City, NewsItem } from '../types';
import { useGameStore } from '../state/store';
import {
  NEWS_TONE_COLOR,
  OUTCOME_KIND_ICON,
  OUTCOME_TONE_COLOR,
  POPULATION_META,
  STAT_META,
} from './statMeta';
import { formatCount } from './format';
import '../styles/outcome.css';

// A handful of defining stats to immortalize on the chronicle.
const DEFINING_STATS: BoundedStatKey[] = ['happiness', 'wealth', 'safety', 'magic', 'chaos', 'pollution'];

/** Pick up to 3 colorful headlines from the log, favoring non-neutral tones. */
function notableNews(news: NewsItem[]): NewsItem[] {
  const flavorful = news.filter((n) => n.tone !== 'neutral');
  const pool = flavorful.length >= 3 ? flavorful : news;
  // Most recent first, take up to 3.
  return pool.slice(-3).reverse();
}

export function OutcomeScreen({ city }: { city: City }) {
  const backToStart = useGameStore((s) => s.backToStart);
  const newGame = useGameStore((s) => s.newGame);
  const outcome = city.outcome;

  // Guard: this screen should only render with an outcome present.
  if (!outcome) return null;

  const color = OUTCOME_TONE_COLOR[outcome.tone];
  const icon = OUTCOME_KIND_ICON[outcome.kind];
  const notable = notableNews(city.news);

  return (
    <div className="chronicle">
      <article
        className="chronicle__scroll mm-parchment-surface"
        style={{ borderColor: color }}
      >
        <div className="chronicle__icon">{icon}</div>
        <div className="chronicle__kicker" style={{ color: 'var(--mm-terracotta)' }}>
          {outcome.tone}
        </div>
        <h1 className="chronicle__title">{outcome.title}</h1>
        <p className="chronicle__city">
          The chronicle of {city.name} — {city.tagline}
        </p>

        <div className="chronicle__rule" />
        <p className="chronicle__desc">{outcome.description}</p>

        <div className="chronicle__stats">
          <div className="chronicle-stat">
            <div className="chronicle-stat__icon">📅</div>
            <div className="chronicle-stat__value">{outcome.day}</div>
            <div className="chronicle-stat__label">Days Survived</div>
          </div>
          <div className="chronicle-stat">
            <div className="chronicle-stat__icon">{POPULATION_META.icon}</div>
            <div className="chronicle-stat__value">{formatCount(city.stats.population)}</div>
            <div className="chronicle-stat__label">{POPULATION_META.label}</div>
          </div>
          {DEFINING_STATS.map((key) => {
            const meta = STAT_META[key];
            return (
              <div className="chronicle-stat" key={key}>
                <div className="chronicle-stat__icon">{meta.icon}</div>
                <div className="chronicle-stat__value">{Math.round(city.stats[key])}</div>
                <div className="chronicle-stat__label">{meta.label}</div>
              </div>
            );
          })}
        </div>

        {notable.length > 0 && (
          <>
            <div className="chronicle__rule" />
            <h2 className="chronicle__section-title">From the Annals</h2>
            <ul className="chronicle__notable">
              {notable.map((n, i) => (
                <li key={`${n.day}-${i}`} style={{ borderLeftColor: NEWS_TONE_COLOR[n.tone] }}>
                  <span className="news-item__day">Day {n.day}</span> — {n.text}
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="chronicle__seed">
          Grown from seed <code>{city.seed.raw}</code>
        </p>

        <div className="chronicle__actions">
          <button className="mm-btn mm-btn--brass" onClick={() => backToStart()}>
            Found a New City
          </button>
          <button className="mm-btn" onClick={() => newGame(city.seed.raw)}>
            Same Seed, New Timeline
          </button>
        </div>
      </article>
    </div>
  );
}
