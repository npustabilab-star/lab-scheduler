import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WeekGrid from './WeekGrid'

describe('WeekGrid', () => {
  it('renders 8 rows x 5 clickable cells and toggles', () => {
    const onToggle = vi.fn()
    const { container } = render(<WeekGrid cells={() => null} onToggle={onToggle} />)
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(40)
    expect(container.querySelectorAll('[data-cell][role="button"]')).toHaveLength(40)
    fireEvent.click(container.querySelector('[data-cell="3-5"]')!)
    expect(onToggle).toHaveBeenCalledWith(3, 5)
  })
  it('orders rows by start time with 午休 (period 8) as the 5th row and clickable', () => {
    const onToggle = vi.fn()
    const { container } = render(<WeekGrid cells={() => null} onToggle={onToggle} />)
    const rows = [...container.querySelectorAll('tbody tr')].map((r) => r.getAttribute('data-row'))
    expect(rows).toEqual(['1', '2', '3', '4', '8', '5', '6', '7'])
    const lunchRow = container.querySelectorAll('tbody tr')[4]
    expect(lunchRow).toHaveTextContent('午休')
    fireEvent.click(lunchRow.querySelector('[data-cell="2-8"]')!)
    expect(onToggle).toHaveBeenCalledWith(2, 8)
  })
  it('uses the given periods (labels and times, 24h without seconds)', () => {
    render(
      <WeekGrid
        cells={() => null}
        periods={[
          { period: 4, label: '第4節', start: '11:10:00', end: '12:00:00' },
          { period: 8, label: '午休', start: '13:00', end: '13:20' },
        ]}
      />,
    )
    expect(screen.getByText('第4節')).toBeInTheDocument()
    expect(screen.getByText('11:10–12:00')).toBeInTheDocument()
    expect(screen.getByText('13:00–13:20')).toBeInTheDocument()
  })
  it('does not fire for disabled cells or grey columns', () => {
    const onToggle = vi.fn()
    const { container } = render(
      <WeekGrid cells={() => null} onToggle={onToggle} isDisabled={(w, p) => w === 1 && p === 1} greyWeekdays={[2]} />,
    )
    fireEvent.click(container.querySelector('[data-cell="1-1"]')!)
    fireEvent.click(container.querySelector('[data-cell="2-3"]')!)
    expect(onToggle).not.toHaveBeenCalled()
    expect(container.querySelector('[data-cell="1-1"]')).toHaveAttribute('data-disabled', 'true')
  })
  it('marks highlighted weekday cells uncovered', () => {
    const { container } = render(<WeekGrid cells={() => null} highlightWeekdays={[4]} />)
    expect(container.querySelectorAll('[data-uncovered="true"]')).toHaveLength(8)
    expect(container.querySelector('[data-cell="4-1"]')).toHaveAttribute('data-uncovered', 'true')
    expect(container.querySelector('[data-cell="3-1"]')).not.toHaveAttribute('data-uncovered')
  })
})
