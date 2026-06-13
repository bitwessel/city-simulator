import { useEffect, useState } from 'react';

/** Where the worldsmith pipeline lives. */
const REPO_URL = 'https://github.com/bitwessel/city-simulator';

/**
 * The worldsmith pipeline, distilled into player-facing steps from
 * `prompts/08-worldsmith-session.md`. Each step is a short title + a line or
 * two of detail (with the real command / prompt where it helps).
 */
const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Fork & run the repo',
    body: (
      <>
        Fork it on GitHub, clone your fork, then <code>npm install</code> and{' '}
        <code>npm run dev</code>. The dev server lives on <code>:5173</code>.
      </>
    ),
  },
  {
    title: 'Brief Claude Code',
    body: (
      <>
        In a Claude Code session, say:{' '}
        <em>
          "Read prompts/08-worldsmith-session.md and build me a world: &lt;your
          one-line brief&gt;"
        </em>{' '}
        — e.g. <em>"a misty harbor city where fishermen and mages keep an uneasy
        truce."</em>
      </>
    ),
  },
  {
    title: 'Let the crew build',
    body: (
      <>
        Claude orchestrates four roles: a <strong>Surveyor</strong> sculpts the
        terrain and river, a <strong>Culturist</strong> writes the lore, factions
        and citizens, a <strong>Dramatist</strong> authors the event chains, and a{' '}
        <strong>Critic</strong> judges every round.
      </>
    ),
  },
  {
    title: 'Pass the gates',
    body: (
      <>
        It loops over <code>validate-world</code>, <code>world-shots</code>{' '}
        (reading its own screenshots), <code>playtest-world</code>, and{' '}
        <code>npm test</code> until the world is beautiful from the default camera
        and still alive after a 250-day run.
      </>
    ),
  },
  {
    title: 'Get a hand-finished world',
    body: (
      <>
        You're left with a new <code>worlds/&lt;id&gt;/</code> folder —{' '}
        <code>world.json</code>, <code>preview.png</code>, and{' '}
        <code>notes.md</code> — plus a one-paragraph pitch of its central tension.
      </>
    ),
  },
  {
    title: 'Open a pull request',
    body: (
      <>
        Push the branch and open a PR. Once it's merged, your world joins the
        Curated Worlds gallery for everyone who plays.
      </>
    ),
  },
];

/**
 * Start-screen invitation to contribute a curated world. Explains that worlds
 * arrive via pull request built with the Claude Code worldsmith pipeline, links
 * to the repo, and opens a step-by-step popup walking through that pipeline.
 */
export function ContributeWorld() {
  const [open, setOpen] = useState(false);

  // Close the popup on Escape while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <section className="start__contribute">
      <h2 className="start__worlds-heading">Add Your Own World</h2>
      <p className="start__worlds-intro">
        Worlds are crafted with the Claude Code worldsmith pipeline, then merged
        through a pull request. Bring a one-line brief — Claude builds, playtests,
        and screenshots the rest.
      </p>

      <div className="start__contribute-actions">
        <a
          className="mm-btn mm-btn--brass"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
        >
          Open the Repo ↗
        </a>
        <button className="mm-btn" onClick={() => setOpen(true)}>
          How the pipeline works
        </button>
      </div>

      {open && (
        <div className="start__modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="start__modal mm-panel--gloss"
            role="dialog"
            aria-modal="true"
            aria-label="How the worldsmith pipeline works"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="start__modal-close"
              onClick={() => setOpen(false)}
              aria-label="Close"
              title="Close"
            >
              ×
            </button>

            <div className="start__modal-kicker">Worldsmith Pipeline</div>
            <h3 className="start__modal-title">Craft a World with Claude</h3>
            <p className="start__modal-lede">
              You don't hand-write JSON. You hand Claude a one-line brief, and it
              orchestrates a small crew to build, playtest, and screenshot a world
              until it's worth shipping. Six steps, start to pull request:
            </p>

            <ol className="start__steps mm-scroll">
              {STEPS.map((step, i) => (
                <li key={i} className="start__step">
                  <span className="start__step-num" aria-hidden>
                    {i + 1}
                  </span>
                  <div className="start__step-text">
                    <span className="start__step-title">{step.title}</span>
                    <span className="start__step-body">{step.body}</span>
                  </div>
                </li>
              ))}
            </ol>

            <a
              className="mm-btn mm-btn--brass start__modal-cta"
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              Open the Repo ↗
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
