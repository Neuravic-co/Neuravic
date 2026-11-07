"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { TeamMember } from "@/lib/site-content";

export function Team({ team }: { team: TeamMember[] }) {
  return (
    <section className="team section-light" id="team">
      <div className="page-shell">
        <div className="section-heading team__heading">
          <div data-reveal>
            <p className="eyebrow">Our team</p>
            <h2>Two people. One team.</h2>
          </div>
          <p className="section-lede" data-reveal>
            Based in Dubai and Cairo. We work as one team from the first idea to launch.
          </p>
        </div>

        <div className="person-grid">
          {team.map((person) => (
            <PersonCard key={person.number} person={person} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PersonCard({ person }: { person: TeamMember }) {
  const [flipped, setFlipped] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const cvRef = useRef<HTMLAnchorElement>(null);
  const interacted = useRef(false);

  useEffect(() => {
    if (!interacted.current) return;
    (flipped ? cvRef : toggleRef).current?.focus({ preventScroll: true });
  }, [flipped]);

  const flip = (next: boolean) => {
    interacted.current = true;
    setFlipped(next);
  };

  return (
    <article className="person-card" data-reveal data-flipped={flipped}>
      <div className="person-card__inner">
        <div className="person-card__face person-card__front" inert={flipped}>
          <div className="person-card__portrait">
            <span className="person-card__city">{person.city}</span>
            <Image
              className="person-card__photo"
              src={person.photo}
              alt={person.name}
              fill
              style={{ objectPosition: person.photoFocus }}
              sizes="(max-width: 58rem) 40vw, 28rem"
            />
          </div>
          <div className="person-card__meta">
            <h3>{person.name}</h3>
            <p>{person.role}</p>
          </div>
          <button
            ref={toggleRef}
            className="person-card__toggle"
            type="button"
            aria-label={`Show info about ${person.name}`}
            onClick={() => flip(true)}
          />
        </div>

        <div className="person-card__face person-card__back" inert={!flipped}>
          <span className="person-card__city">{person.city}</span>
          <div className="person-card__info">
            <h3>{person.name}</h3>
            <p className="person-card__role">{person.role}</p>
            <p className="person-card__summary">{person.summary}</p>
            <ul className="person-card__skills">
              {person.skills.map((skill) => (
                <li key={skill}>{skill}</li>
              ))}
            </ul>
          </div>
          <div className="person-card__actions">
            <a ref={cvRef} className="person-card__cv" href={person.cv} target="_blank" rel="noopener noreferrer">
              View CV
            </a>
            <button className="person-card__back-button" type="button" onClick={() => flip(false)}>
              Back
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
