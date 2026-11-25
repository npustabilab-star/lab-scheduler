import { weekRangeLabel } from '../lib/week'

type Props = { monday: string; onPrev: () => void; onToday: () => void; onNext: () => void }

export default function WeekNav({ monday, onPrev, onToday, onNext }: Props) {
  const btn = 'rounded border px-3 py-1'
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
      <span className="text-sm font-medium" data-testid="week-range">
        {weekRangeLabel(monday)}
      </span>
    </div>
  )
}
