import type { KeyboardEvent, ReactNode } from 'react'
import { DEFAULT_PERIODS, WEEKDAYS, WEEKDAY_LABELS } from '../lib/grid'
import type { PeriodInfo } from '../lib/grid'
import { formatHM, shortDate } from '../lib/week'

type Props = {
  cells: (weekday: number, period: number) => ReactNode
  onToggle?: (weekday: number, period: number) => void
  isOn?: (weekday: number, period: number) => boolean
  /** Cells that can be seen but not clicked (grey). */
  isDisabled?: (weekday: number, period: number) => boolean
  highlightWeekdays?: number[]
  /** Whole columns shown grey (e.g. no-class days). */
  greyWeekdays?: number[]
  /** Dates (Mon-Fri) shown under the weekday labels. */
  days?: string[]
  /** Small note under a column header, by weekday. */
  dayNotes?: Record<number, string>
  /** Rows in start-time order (including 午休). Defaults to 1,2,3,4,午休,5,6,7 without times. */
  periods?: PeriodInfo[]
}

export default function WeekGrid({
  cells,
  onToggle,
  isOn,
  isDisabled,
  highlightWeekdays = [],
  greyWeekdays = [],
  days,
  dayNotes,
  periods = DEFAULT_PERIODS,
}: Props) {
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-xl border border-sky-100 text-center text-sm">
      <thead>
        <tr>
          <th className="w-10 bg-lab sm:w-24" />
          {WEEKDAYS.map((w) => (
            <th key={w} className="bg-lab p-1.5 font-semibold text-sky-950">
              {WEEKDAY_LABELS[w - 1]}
              {days && <span className="block text-xs font-normal text-sky-900">{shortDate(days[w - 1])}</span>}
              {dayNotes?.[w] && <span className="block text-xs font-normal text-amber-800">{dayNotes[w]}</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {periods.map((info) => {
          const p = info.period
          return (
            <tr key={p} data-row={p}>
              <th scope="row" className={`border-t border-sky-100 p-1 text-xs font-medium ${info.label === '午休' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>
                <span className="sm:hidden">{info.label.replace(/[第節]/g, '')}</span>
                <span className="hidden sm:inline">{info.label}</span>
                {info.start && info.end && (
                  <span className="hidden font-normal text-slate-500 sm:block">
                    {formatHM(info.start)}–{formatHM(info.end)}
                  </span>
                )}
              </th>
              {WEEKDAYS.map((w) => {
                const uncovered = highlightWeekdays.includes(w)
                const grey = greyWeekdays.includes(w)
                const disabled = grey || (isDisabled?.(w, p) ?? false)
                const on = isOn?.(w, p) ?? false
                const clickable = !!onToggle && !disabled
                const fire = () => onToggle?.(w, p)
                return (
                  <td
                    key={w}
                    data-cell={`${w}-${p}`}
                    data-uncovered={uncovered ? 'true' : undefined}
                    data-on={on ? 'true' : undefined}
                    data-disabled={disabled ? 'true' : undefined}
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={clickable ? fire : undefined}
                    onKeyDown={
                      clickable
                        ? (e: KeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              fire()
                            }
                          }
                        : undefined
                    }
                    className={[
                      'h-10 border-t border-l border-sky-100 align-middle transition-colors',
                      clickable ? 'cursor-pointer hover:bg-sky-50' : '',
                      uncovered
                        ? 'bg-rose-100'
                        : disabled
                          ? 'bg-slate-100 text-slate-400'
                          : on
                            ? 'bg-emerald-100 font-semibold text-emerald-800 hover:bg-emerald-200'
                            : info.label === '午休'
                              ? 'bg-amber-50/60'
                              : 'bg-white',
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
