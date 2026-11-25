import { weekRangeLabel } from '../lib/week'

type Props = { monday: string; onPrev: () => void; onToday: () => void; onNext: () => void }

export default function WeekNav({ monday, onPrev, onToday, onNext }: Props) {
  const btn = 'rounded-full border border-indigo-200 bg-white px-3 py-1 text-indigo-700 shadow-sm hover:bg-indigo-50'
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <button type="button" aria-label="上一週" className={btn} onClick={onPrev}>
        ‹
      </button>
      <button type="button" className={btn} onClick={onToday}>
        本週
      </button>
      <button type="button" aria-label="下一週" className={btn} onClick={onNext}>
        ›
      </button>
      <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-800" data-testid="week-range">
        {weekRangeLabel(monday)}
      </span>
    </div>
  )
}
