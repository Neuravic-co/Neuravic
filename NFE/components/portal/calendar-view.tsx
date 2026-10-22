"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Example events so the layout can be judged; they follow the month being viewed. */
const SAMPLE_EVENTS = [
  { day: 3, title: "Team stand-up", kind: "Meeting" },
  { day: 9, title: "Client review", kind: "Meeting" },
  { day: 14, title: "Sprint deadline", kind: "Deadline" },
  { day: 21, title: "Planning session", kind: "Meeting" },
  { day: 27, title: "Annual leave", kind: "Leave" },
];

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

function buildMonth(year: number, month: number) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const length = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function CalendarView() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const weeks = useMemo(() => {
    const cells = buildMonth(cursor.year, cursor.month);
    return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  }, [cursor]);
  const isThisMonth = cursor.year === today.getFullYear() && cursor.month === today.getMonth();
  const eventsByDay = useMemo(() => new Map(SAMPLE_EVENTS.map((event) => [event.day, event])), []);

  function shift(step: number) {
    setCursor(({ year, month }) => {
      const next = new Date(year, month + step, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  return (
    <div className="ws-calendar">
      <section className="ws-card ws-calendar__month">
        <header>
          <h2>{monthFormat.format(new Date(cursor.year, cursor.month, 1))}</h2>
          <div>
            <button type="button" className="ws-icon-button" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft aria-hidden="true" size={18} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className="ws-pill-button"
              onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
              disabled={isThisMonth}
            >
              Today
            </button>
            <button type="button" className="ws-icon-button" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight aria-hidden="true" size={18} strokeWidth={1.5} />
            </button>
          </div>
        </header>

        <table className="ws-calendar__grid">
          <caption className="sr-only">{monthFormat.format(new Date(cursor.year, cursor.month, 1))}</caption>
          <thead>
            <tr>
              {WEEKDAYS.map((day) => (
                <th key={day} scope="col">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, row) => (
              <tr key={row}>
                {week.map((day, column) => {
                  const event = day ? eventsByDay.get(day) : undefined;
                  const isToday = isThisMonth && day === today.getDate();
                  return (
                    <td
                      key={column}
                      className={`ws-day${day ? "" : " is-blank"}${isToday ? " is-today" : ""}${event ? " has-event" : ""}`}
                      aria-current={isToday ? "date" : undefined}
                    >
                      {day ? <span>{day}</span> : null}
                      {event ? <span className="sr-only">{event.title}</span> : null}
                      {event ? <i aria-hidden="true" /> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="ws-card ws-calendar__upcoming">
        <h3>Coming up</h3>
        <ul>
          {SAMPLE_EVENTS.map((event) => (
            <li key={event.day}>
              <span className="ws-date" aria-hidden="true">
                {event.day}
              </span>
              <div>
                <strong>{event.title}</strong>
                <span>{event.kind}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="ws-notice ws-notice--inline">Example events. Your own calendar will appear here once it is connected.</p>
      </section>
    </div>
  );
}
