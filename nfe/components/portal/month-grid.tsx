"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

function buildMonth(year: number, month: number) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const length = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export interface DayEvent {
  day: number;
  title: string;
}

/** A month table with previous, next and today controls. `eventsFor` marks days in the month being viewed. */
export function MonthGrid({ eventsFor, onMonthChange }: { eventsFor: (year: number, month: number) => DayEvent[]; onMonthChange?: (year: number) => void }) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const weeks = useMemo(() => {
    const cells = buildMonth(cursor.year, cursor.month);
    return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  }, [cursor]);
  const isThisMonth = cursor.year === today.getFullYear() && cursor.month === today.getMonth();
  const eventsByDay = useMemo(() => new Map(eventsFor(cursor.year, cursor.month).map((event) => [event.day, event])), [eventsFor, cursor]);

  function shift(step: number) {
    setCursor(({ year, month }) => {
      const next = new Date(year, month + step, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  useEffect(() => onMonthChange?.(cursor.year), [cursor.year, onMonthChange]);

  return (
    <div className="ws-calendar__month-wrap">
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

    </div>
  );
}
