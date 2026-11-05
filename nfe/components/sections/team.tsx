import type { TeamMember } from "@/lib/site-content";

export function Team({ team }: { team: TeamMember[] }) {
  return (
    <section className="team section-light" id="team">
      <div className="page-shell">
        <div className="section-heading team__heading">
          <div data-reveal>
            <p className="eyebrow">Our team</p>
            <h2>Three people. One team.</h2>
          </div>
          <p className="section-lede" data-reveal>
            Based in Dubai and Cairo. We work as one team from the first idea to launch.
          </p>
        </div>

        <div className="person-grid">
          {team.map((person) => (
            <article className="person-card" data-reveal key={person.number}>
              <div className="person-card__portrait">
                <span className="person-card__city">{person.city}</span>
                <svg className="person-card__figure" viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="36" r="17" />
                  <path d="M14 100c0-25 16-40 36-40s36 15 36 40z" />
                </svg>
              </div>
              <div className="person-card__meta">
                <h3>{person.name}</h3>
                <p>{person.role}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
