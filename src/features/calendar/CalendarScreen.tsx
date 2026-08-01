import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { EMOTIONS } from "../../data";
import { EmotionStar } from "../../EmotionStar";
import { MOTION } from "../../motion";
import { useAppLanguage } from "../../i18n";
import type { EmotionNote } from "../../types";
import { useDialogFocus } from '../../app/useDialogFocus';

export function CalendarScreen({
  notes,
  onOpenNote,
  onClose,
}: {
  notes: EmotionNote[];
  onOpenNote: (noteId: string) => void;
  onClose: () => void;
}) {
  const { copy, locale } = useAppLanguage();
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [anchor, setAnchor] = useState(getLocalCalendarAnchor);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const dayPageRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useDialogFocus<HTMLDivElement>({ onEscape: onClose });

  const selectedNotes = notes.filter((note) => note.date === selectedDate);
  const todayDateKey = getTodayDateKey();
  const selectCalendarDate = (dateKey: string) => {
    const date = dateFromKey(dateKey);
    setAnchor({ year: date.getFullYear(), month: date.getMonth() });
    setSelectedDate(dateKey);
  };
  const shiftMonth = (offset: number) => {
    const next = new Date(anchor.year, anchor.month + offset, 1, 12);
    setAnchor({ year: next.getFullYear(), month: next.getMonth() });
  };

  useEffect(() => {
    if (!selectedDate) return;
    dayPageRef.current?.scrollTo({ top: 0 });
  }, [selectedDate]);

  return (
    <section
      className="paper-screen calendar-screen"
      aria-label={copy.calendar.label}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={dialogRef}
        className="calendar-paper"
        role="dialog"
        aria-modal="true"
        aria-label={copy.calendar.label}
        tabIndex={-1}
        initial={{ y: 38, opacity: 0.92 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={MOTION.sheet}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="calendar-paper__header">
          <h1 className="visually-hidden">
            {copy.calendar.yearLabel(anchor.year)}
          </h1>
          <div className="calendar-header-actions">
            <button
              className="round-back-button calendar-header-button"
              onClick={() => {
                if (selectedDate) {
                  setSelectedDate(null);
                  return;
                }
                setMode((current) => (current === 'month' ? 'year' : 'month'));
              }}
              aria-label={
                selectedDate
                  ? copy.calendar.backToCalendar
                  : mode === 'month'
                    ? copy.calendar.showYear
                    : copy.calendar.backToMonth
              }
            >
              {selectedDate || mode === 'month' ? (
                <ChevronLeft size={22} strokeWidth={2.2} />
              ) : (
                <ChevronRight size={22} strokeWidth={2.2} />
              )}
            </button>
            <button
              className="round-back-button popup-close-button calendar-header-button calendar-close-button"
              onClick={onClose}
              aria-label={copy.common.close}
            >
              <X size={22} strokeWidth={2.2} />
            </button>
          </div>
        </header>

        <div className="calendar-page-viewport">
          <AnimatePresence mode="wait" initial={false}>
            {selectedDate ? (
              <motion.div
                key="calendar-day"
                ref={dayPageRef}
                className="calendar-day-page"
                initial={{ opacity: 0, x: '32%' }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: '24%' }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                aria-label={copy.calendar.dateRecords(
                  formatLongDate(selectedDate, locale),
                )}
              >
                <CalendarDateStrip
                  selectedDate={selectedDate}
                  notes={notes}
                  todayDateKey={todayDateKey}
                  onSelectDate={selectCalendarDate}
                />
                <header className="calendar-day-page__header">
                  <h2>{formatLongDate(selectedDate, locale)}</h2>
                </header>
                <div className="calendar-day-page__content">
                  {selectedNotes.length ? (
                    selectedNotes.map((note) => (
                      <button
                        key={note.id}
                        className="day-note-card"
                        onClick={() => onOpenNote(note.id)}
                      >
                        <EmotionStar
                          emotion={note.emotion}
                          size={42}
                          colorOverride={note.color}
                        />
                        <span>
                          <strong>{note.title}</strong>
                          <small>
                            {note.time} · {note.place}
                          </small>
                          <em>{note.excerpt}</em>
                        </span>
                        <ChevronRight size={18} strokeWidth={2.2} />
                      </button>
                    ))
                  ) : (
                    <div className="empty-day">
                      <strong>{copy.calendar.empty}</strong>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={`calendar-${mode}`}
                className="calendar-main-page"
                initial={{ opacity: 0, x: '-12%' }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: '-10%' }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <nav
                  className="calendar-period-nav"
                  aria-label={copy.calendar.periodNavigation}
                >
                  <button
                    onClick={() =>
                      mode === 'month'
                        ? shiftMonth(-1)
                        : setAnchor((current) => ({
                            ...current,
                            year: current.year - 1,
                          }))
                    }
                    aria-label={
                      mode === 'month'
                        ? copy.calendar.previousMonth
                        : copy.calendar.previousYear
                    }
                  >
                    <ChevronLeft size={20} strokeWidth={2.2} />
                  </button>
                  <strong>
                    {mode === 'month'
                      ? `${copy.calendar.yearLabel(anchor.year)} · ${copy.calendar.monthLabel(anchor.month + 1)}`
                      : copy.calendar.yearLabel(anchor.year)}
                  </strong>
                  <button
                    onClick={() =>
                      mode === 'month'
                        ? shiftMonth(1)
                        : setAnchor((current) => ({
                            ...current,
                            year: current.year + 1,
                          }))
                    }
                    aria-label={
                      mode === 'month'
                        ? copy.calendar.nextMonth
                        : copy.calendar.nextYear
                    }
                  >
                    <ChevronRight size={20} strokeWidth={2.2} />
                  </button>
                </nav>
                {mode === 'month' ? (
                  <div className="calendar-scroll">
                    <MonthSection
                      year={anchor.year}
                      month={anchor.month}
                      notes={notes}
                      todayDateKey={todayDateKey}
                      onSelectDate={selectCalendarDate}
                    />
                    <MonthSection
                      year={anchor.month === 11 ? anchor.year + 1 : anchor.year}
                      month={(anchor.month + 1) % 12}
                      notes={notes}
                      todayDateKey={todayDateKey}
                      onSelectDate={selectCalendarDate}
                    />
                  </div>
                ) : (
                  <YearCalendar
                    year={anchor.year}
                    notes={notes}
                    onSelectMonth={(month) => {
                      setAnchor({ year: anchor.year, month });
                      setMode('month');
                    }}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </section>
  );
}

export function CalendarDateStrip({
  selectedDate,
  notes,
  todayDateKey,
  onSelectDate,
}: {
  selectedDate: string;
  notes: EmotionNote[];
  todayDateKey: string;
  onSelectDate: (dateKey: string) => void;
}) {
  const { copy, locale } = useAppLanguage();
  const weekDates = getWeekDateKeys(selectedDate);
  const weekdayLabels = copy.calendar.weekdays;

  return (
    <nav
      className="calendar-date-strip"
      aria-label={copy.calendar.switchDate}
    >
      {weekDates.map((dateKey, index) => {
        const date = dateFromKey(dateKey);
        const dayNotes = notes.filter((note) => note.date === dateKey);
        const selected = dateKey === selectedDate;
        const today = dateKey === todayDateKey;
        return (
          <button
            key={dateKey}
            className={`calendar-date-strip__item ${selected ? 'is-selected' : ''} ${
              today ? 'is-today' : ''
            }`}
            onClick={() => onSelectDate(dateKey)}
            aria-current={selected ? 'date' : undefined}
            aria-label={`${formatLongDate(dateKey, locale)}，${copy.calendar.recordCount(
              dayNotes.length,
            )}`}
          >
            <span>{weekdayLabels[index]}</span>
            <strong>{date.getDate()}</strong>
            <i aria-hidden="true">
              {dayNotes.slice(0, 2).map((note) => (
                <EmotionStar
                  key={note.id}
                  emotion={note.emotion}
                  size={13}
                  colorOverride={note.color}
                  className="calendar-date-strip__star"
                />
              ))}
            </i>
          </button>
        );
      })}
    </nav>
  );
}

export function MonthSection({
  year,
  month,
  notes,
  todayDateKey,
  onSelectDate,
}: {
  year: number;
  month: number;
  notes: EmotionNote[];
  todayDateKey: string;
  onSelectDate: (dateKey: string) => void;
}) {
  const { copy, locale } = useAppLanguage();
  const grid = getMonthGrid(year, month);
  return (
    <section className="month-section">
      <h2>{copy.calendar.monthLabel(month + 1)}</h2>
      <div className="weekday-row" aria-hidden="true">
        {copy.calendar.weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="month-grid">
        {grid.map((day, index) => {
          if (!day) return <span key={`blank-${index}`} className="calendar-day is-blank" />;
          const dateKey = toDateKey(year, month, day);
          const dayNotes = notes.filter((note) => note.date === dateKey);
          return (
            <button
              key={dateKey}
              className={`calendar-day ${dayNotes.length ? 'has-notes' : ''} ${
                dateKey === todayDateKey ? 'is-today' : ''
              }`}
              onClick={() => onSelectDate(dateKey)}
              aria-current={dateKey === todayDateKey ? 'date' : undefined}
              aria-label={`${formatLongDate(
                dateKey,
                locale,
              )}, ${copy.calendar.recordCount(dayNotes.length)}`}
            >
              <span>{day}</span>
              <i className="emotion-footprint">
                {dayNotes.slice(0, 3).map((note) => (
                  <EmotionStar
                    key={note.id}
                    emotion={note.emotion}
                    size={24}
                    colorOverride={note.color}
                    className="calendar-emotion-star"
                  />
                ))}
                {dayNotes.length > 3 ? <em>+{dayNotes.length - 3}</em> : null}
              </i>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function YearCalendar({
  year,
  notes,
  onSelectMonth,
}: {
  year: number;
  notes: EmotionNote[];
  onSelectMonth: (month: number) => void;
}) {
  const { copy } = useAppLanguage();
  return (
    <div className="year-calendar-wrap">
      <div className="year-calendar__title">
        <strong>{year}</strong>
      </div>
      <div className="year-calendar">
        {Array.from({ length: 12 }, (_, month) => {
          const grid = getMonthGrid(year, month);
          return (
            <button
              key={month}
              className="mini-month"
              onClick={() => onSelectMonth(month)}
              aria-label={copy.calendar.monthLabel(month + 1)}
            >
              <strong>{copy.calendar.monthLabel(month + 1)}</strong>
              <span className="mini-month__week">
                {copy.calendar.weekdays.map((day) => (
                  <i key={day}>{day}</i>
                ))}
              </span>
              <span className="mini-month__grid">
                {grid.map((day, index) => {
                  if (!day) return <i key={`blank-${index}`} />;
                  const dateKey = toDateKey(year, month, day);
                  const dayNotes = notes.filter((note) => note.date === dateKey);
                  const colors = dayNotes.slice(0, 3).map((note) =>
                    note.emotion ? EMOTIONS[note.emotion].color : '#5C5C5C',
                  );
                  return (
                    <i key={dateKey} className={dayNotes.length ? 'has-footprint' : ''}>
                      {day}
                      {colors.length ? (
                        <b
                          style={{
                            background:
                              colors.length === 1
                                ? colors[0]
                                : `conic-gradient(${colors
                                    .map(
                                      (color, colorIndex) =>
                                        `${color} ${(colorIndex / colors.length) * 100}% ${
                                          ((colorIndex + 1) / colors.length) * 100
                                        }%`,
                                    )
                                    .join(',')})`,
                          }}
                        />
                      ) : null}
                    </i>
                  );
                })}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function getMonthGrid(year: number, month: number) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = Array(firstWeekday).fill(null);
  for (let day = 1; day <= days; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function getTodayDateKey() {
  const today = new Date();
  return toDateKey(today.getFullYear(), today.getMonth(), today.getDate());
}

export function getLocalCalendarAnchor() {
  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth() };
}

export function getWeekDateKeys(dateKey: string) {
  const selected = dateFromKey(dateKey);
  const start = new Date(selected);
  start.setDate(selected.getDate() - selected.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return toDateKey(date.getFullYear(), date.getMonth(), date.getDate());
  });
}

export function formatLongDate(dateKey: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(dateFromKey(dateKey));
}
