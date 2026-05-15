import { clamp, formatTime, isValidTrimRange } from './utils'

describe('utils', () => {
  it('clamps values to range', () => {
    expect(clamp(10, 0, 4)).toBe(4)
    expect(clamp(-2, 0, 4)).toBe(0)
    expect(clamp(2, 0, 4)).toBe(2)
  })

  it('formats time', () => {
    expect(formatTime(62.34)).toBe('01:02.34')
  })

  it('validates trim range', () => {
    expect(isValidTrimRange(1, 4, 10)).toBe(true)
    expect(isValidTrimRange(4, 4, 10)).toBe(false)
    expect(isValidTrimRange(-1, 4, 10)).toBe(false)
    expect(isValidTrimRange(1, 12, 10)).toBe(false)
  })
})
