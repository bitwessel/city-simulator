import type { City } from '../types';
import { NEWS_TONE_COLOR } from './statMeta';

export function NewsFeed({ city }: { city: City }) {
  // Newest first. The simulation appends newest-last, so reverse a copy.
  // Use an index offset key so identical headlines on the same day stay stable.
  const items = city.news
    .map((item, idx) => ({ item, idx }))
    .slice()
    .reverse();

  return (
    <section className="news mm-panel">
      <div className="news__head">📰 The {city.name} Crier</div>
      <div className="news__list mm-scroll">
        {items.length === 0 ? (
          <p className="empty-note">No news yet. Enjoy the quiet.</p>
        ) : (
          items.map(({ item, idx }) => {
            const color = NEWS_TONE_COLOR[item.tone];
            return (
              <article
                key={`${item.day}-${idx}`}
                className="news-item"
                style={{ borderLeftColor: color }}
              >
                <div className="news-item__day">Day {item.day}</div>
                <div className="news-item__text">{item.text}</div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
