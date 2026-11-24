import { describe, expect, it } from 'vitest'
import { createLatestOnly } from './latestOnly'

describe('createLatestOnly', () => {
  it('ignores an earlier, slower load that finishes after a later one', async () => {
    const begin = createLatestOnly()
    const applied: string[] = []
    const load = async (label: string, ms: number) => {
      const isCurrent = begin()
      await new Promise((r) => setTimeout(r, ms))
      if (isCurrent()) applied.push(label)
    }
    await Promise.all([load('old-range', 30), load('new-range', 5)])
    expect(applied).toEqual(['new-range'])
  })

  it('applies a load when nothing newer started', async () => {
    const begin = createLatestOnly()
    const isCurrent = begin()
    expect(isCurrent()).toBe(true)
  })
})
