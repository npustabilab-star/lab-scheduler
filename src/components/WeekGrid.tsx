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
    <table className="w-full table-fixed border-collapse text-center text-sm">
      <thead>
        <tr>
          <th className="w-10 sm:w-24" />
          {WEEKDAYS.map((w) => (
            <th key={w} className="p-1 font-medium">
              {WEEKDAY_LABELS[w - 1]}
              {days && <span className="block text-xs font-normal text-gray-600">{shortDate(days[w - 1])}</span>}
              {dayNotes?.[w] && <span className="block text-xs font-normal text-gray-600">{dayNotes[w]}</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {periods.map((info) => {
          const p = info.period
          return (
            <tr key={p} data-row={p}>
              <th scope="row" className="p-1 text-xs font-normal text-gray-600">
                <span className="sm:hidden">{info.label.replace(/[第節]/g, '')}</span>
                <span className="hidden sm:inline">{info.label}</span>
                {info.start && info.end && (
                  <span className="hidden sm:block">
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
                      'h-9 border border-gray-200 align-middle',
                      clickable ? 'cursor-pointer' : '',
                      uncovered ? 'bg-red-100' : disabled ? 'bg-gray-200 text-gray-500' : on ? 'bg-green-200' : 'bg-white',
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
