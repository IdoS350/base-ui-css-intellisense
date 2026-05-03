import { describe, expect, it } from 'vitest'
import type { SelectorIndex } from './ast-analyzer'

describe('WorkerClient message serialization', () => {
  it('reconstructs SelectorIndex from entries', () => {
    const entries: [string, string[]][] = [['root', ['Popover.Root']]]
    const map: SelectorIndex = new Map(entries)
    expect(map.get('root')).toEqual(['Popover.Root'])
  })

  it('handles multiple entries correctly', () => {
    const entries: [string, string[]][] = [
      ['root', ['Popover.Root', 'Dialog.Root']],
      ['trigger', ['Popover.Trigger']],
    ]
    const map: SelectorIndex = new Map(entries)
    expect(map.get('root')).toEqual(['Popover.Root', 'Dialog.Root'])
    expect(map.get('trigger')).toEqual(['Popover.Trigger'])
    expect(map.size).toBe(2)
  })

  it('returns empty map from empty entries', () => {
    const entries: [string, string[]][] = []
    const map: SelectorIndex = new Map(entries)
    expect(map.size).toBe(0)
  })
})
