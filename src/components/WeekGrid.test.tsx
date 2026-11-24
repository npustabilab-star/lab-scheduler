import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WeekGrid from './WeekGrid'

describe('WeekGrid', () => {
  it('renders 40 cells and toggles', () => {
    const onToggle = vi.fn()
    const { container } = render(<WeekGrid cells={() => null} onToggle={onToggle} />)
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(40)
    fireEvent.click(container.querySelector('[data-cell="3-5"]')!)
    expect(onToggle).toHaveBeenCalledWith(3, 5)
  })
  it('marks highlighted weekday cells uncovered', () => {
    const { container } = render(<WeekGrid cells={() => null} highlightWeekdays={[4]} />)
    expect(container.querySelectorAll('[data-uncovered="true"]')).toHaveLength(8)
    expect(container.querySelector('[data-cell="4-1"]')).toHaveAttribute('data-uncovered', 'true')
    expect(container.querySelector('[data-cell="3-1"]')).not.toHaveAttribute('data-uncovered')
  })
  it('shows period labels and times', () => {
    render(<WeekGrid cells={() => null} periodTimes={{ 1: { start: '08:10', end: '09:00' } }} />)
    expect(screen.getByText('第1節')).toBeInTheDocument()
    expect(screen.getByText('08:10–09:00')).toBeInTheDocument()
  })
})
