interface CalendarHeaderProps {
  weekStart: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
}

function formatWeekRange(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const startMonth = weekStart.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = weekEnd.toLocaleDateString('en-US', { month: 'short' });
  const year = weekEnd.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${weekStart.getDate()} - ${weekEnd.getDate()}, ${year}`;
  }
  return `${startMonth} ${weekStart.getDate()} - ${endMonth} ${weekEnd.getDate()}, ${year}`;
}

export function CalendarHeader({
  weekStart,
  onPrevWeek,
  onNextWeek,
  onToday,
}: CalendarHeaderProps): JSX.Element {
  return (
    <div className="calendar-header">
      <div className="calendar-nav">
        <button
          className="calendar-nav-btn"
          onClick={onPrevWeek}
          aria-label="Previous week"
          title="Previous week (Ctrl/Cmd + Left)"
        >
          ‹
        </button>
        <button
          className="calendar-nav-btn"
          onClick={onNextWeek}
          aria-label="Next week"
          title="Next week (Ctrl/Cmd + Right)"
        >
          ›
        </button>
        <button
          className="calendar-today-btn"
          onClick={onToday}
          title="Go to today (T)"
        >
          Today
        </button>
      </div>

      <h2 className="calendar-title">{formatWeekRange(weekStart)}</h2>
    </div>
  );
}
