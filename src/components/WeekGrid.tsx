import type { ReactNode } from 'react'
import { PERIODS, WEEKDAYS, WEEKDAY_LABELS } from '../lib/grid'

type Props = {
  cells: (weekday: number, period: number) => ReactNode
  onToggle?: (weekday: number, period: number) => void
  isOn?: (weekday: number, period: number) => boolean
  highlightWeekdays?: number[]
  periodTimes?: Record<number, { start: string; end: string }>
}

export default function WeekGrid({ cells, onToggle, isOn, highlightWeekdays = [], periodTimes }: Props) {
  return (
    <table className="w-full table-fixed border-collapse text-center text-sm">
      <thead>
        <tr>
          <th className="w-10 sm:w-24" />
          {WEEKDAYS.map((w) => (
            <th key={w} className="p-1 font-medium">
              {WEEKDAY_LABELS[w - 1]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {PERIODS.map((p) => {
          const t = periodTimes?.[p]
          return (
            <tr key={p}>
              <th scope="row" className="p-1 text-xs font-normal text-gray-600">
                <span className="sm:hidden">{p}</span>
                <span className="hidden sm:inline">第{p}節</span>
                {t && (
                  <span className="hidden sm:block">
                    {t.start}–{t.end}
                  </span>
                )}
              </th>
              {WEEKDAYS.map((w) => {
                const uncovered = highlightWeekdays.includes(w)
                const on = isOn?.(w, p) ?? false
                return (
                  <td
                    key={w}
                    data-cell={`${w}-${p}`}
                    data-uncovered={uncovered ? 'true' : undefined}
                    data-on={on ? 'true' : undefined}
                    onClick={onToggle ? () => onToggle(w, p) : undefined}
                    className={[
                      'h-9 border border-gray-200 align-middle',
                      onToggle ? 'cursor-pointer' : '',
                      uncovered ? 'bg-red-100' : on ? 'bg-green-200' : 'bg-white',
                    ].join(' ')}
                  >
                    {cells(w, p)}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
