/* global describe, test, expect */
import { dayLabels, withGaps, coveredDays, avgTimes } from '../src/utils/historyModel'

const DAY = 86400
const from = Date.UTC(2026, 10, 1) / 1000
const history = (coveredFrom) => ({ from, coveredFrom, series: { requests: [1, 2, 3, 4], avgMs: [null, 10, null, 20], bytes: [5, 6, 7, 8] } })

describe('dayLabels', () => {
  test('names each UTC day', () => {
    expect(dayLabels(history(null))).toEqual(['1 Nov', '2 Nov', '3 Nov', '4 Nov'])
    expect(dayLabels(null)).toEqual([])
  })
})

describe('withGaps', () => {
  test('days that end before the first stored hour are gaps, the first covered day stays', () => {
    expect(withGaps([1, 2, 3, 4], history(from + 2 * DAY + 3600))).toEqual([null, null, 3, 4])
    expect(withGaps([1, 2, 3, 4], history(from))).toEqual([1, 2, 3, 4])
  })
  test('with nothing stored every day is unknown', () => {
    expect(withGaps([1, 2], history(null))).toEqual([null, null])
  })
  test('a day without traffic inside the covered range stays zero', () => {
    expect(withGaps([0, 0, 3], { from, coveredFrom: from, series: { requests: [0, 0, 3] } })).toEqual([0, 0, 3])
  })
})

describe('coveredDays', () => {
  test('counts the days the stored data reaches back', () => {
    expect(coveredDays(history(from + 2 * DAY + 5))).toBe(2)
    expect(coveredDays(history(from - 10 * DAY))).toBe(4)
    expect(coveredDays(history(null))).toBeNull()
  })
})

test('average times keep empty days as gaps', () => {
  expect(avgTimes(history(from))).toEqual([null, 10, null, 20])
})
