import { heatmapWeeks, type StreakDay } from "@/lib/account";
import "./account.css";

const dayNames = ["T2", "", "T4", "", "T6", "", "CN"];

/** A calendar of learning days: each square is one day, darker means more activity. */
export function ActivityHeatmap({ days, today, weeks = 18 }: { days: StreakDay[]; today: string; weeks?: number }) {
  const grid = heatmapWeeks(days, today, weeks);
  return <div className="activity-heatmap" role="img" aria-label={`${days.filter((day) => day.events > 0).length} ngày có hoạt động học trong ${weeks} tuần qua`}>
    <div className="activity-heatmap-days" aria-hidden="true">{dayNames.map((name, index) => <span key={index}>{name}</span>)}</div>
    <div className="activity-heatmap-grid">
      {grid.map((week) => <div key={week[0].date} className="activity-heatmap-week">
        {week.map((cell) => <i key={cell.date} title={cell.future ? undefined : `${cell.date}: ${cell.events} hoạt động`}
          className={cell.future ? "future" : `level-${Math.min(4, cell.events)}${cell.date === today ? " today" : ""}`} />)}
      </div>)}
    </div>
    <div className="activity-heatmap-legend" aria-hidden="true">Ít <i className="level-0" /><i className="level-1" /><i className="level-2" /><i className="level-3" /><i className="level-4" /> Nhiều</div>
  </div>;
}
