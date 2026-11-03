/* global describe, test, expect */
import {
  isRange, scopeOf, errorShare, bucketLabels, bytesPerSecond, responseTimes, proxyRows, percentileText, OTHER_ID,
  changeText, pointsChange, heatmap,
} from '../src/utils/trafficModel'

const summary = (requests, s5xx = 0, extra = {}) => ({
  requests,
  status: { '2xx': requests - s5xx, '3xx': 0, '4xx': 0, '5xx': s5xx },
  bytes: 0,
  avgMs: null,
  series: { requests: [], avgMs: [], bytes: [] },
  ...extra,
})
const traffic = {
  range: '1h',
  bucketSeconds: 60,
  from: Date.UTC(2026, 10, 3, 9, 0) / 1000,
  totals: { ...summary(100, 5), series: { requests: [1, 2, 3], bytes: [60, 120, 0], avgMs: [10, null, 30] } },
  proxies: [
    { id: 'a', name: 'Alpha', domains: ['a.example.com'], proxyStatus: 'active', ...summary(10, 1, { bytes: 5, avgMs: 20 }) },
    { id: 'b', name: 'Beta', domains: ['b.example.com'], proxyStatus: 'disabled', ...summary(80, 4) },
    { id: 'c', name: 'Gamma', domains: [], ...summary(0) },
  ],
  other: { ...summary(10), hosts: ['x.example.org'] },
}

describe('range', () => {
  test('accepts only the four ranges', () => {
    expect(['1h', '6h', '24h', '7d'].every(isRange)).toBe(true)
    expect(isRange('1y')).toBe(false)
    expect(isRange(null)).toBe(false)
  })
})

describe('scopeOf', () => {
  test('no id is all proxies, an id is one proxy, "other" is the unmatched hosts', () => {
    expect(scopeOf(traffic, null).summary).toBe(traffic.totals)
    expect(scopeOf(traffic, 'b').name).toBe('Beta')
    expect(scopeOf(traffic, OTHER_ID)).toMatchObject({ name: 'Other hosts', domains: ['x.example.org'] })
  })
  test('an unknown proxy or a missing report is null', () => {
    expect(scopeOf(traffic, 'zzz')).toBeNull()
    expect(scopeOf(null, null)).toBeNull()
    expect(scopeOf({ ...traffic, other: null }, OTHER_ID)).toBeNull()
  })
})

describe('errorShare', () => {
  test('5xx over the classified responses, null with none', () => {
    expect(errorShare(summary(100, 5))).toBeCloseTo(0.05)
    expect(errorShare(summary(0))).toBeNull()
    expect(errorShare(undefined)).toBeNull()
  })
})

describe('series helpers', () => {
  test('there is one label per bucket', () => {
    expect(bucketLabels(traffic)).toHaveLength(3)
  })
  test('bandwidth is bytes per second per bucket', () => {
    expect(bytesPerSecond({ bytes: [60, 120, 0] }, 60)).toEqual([1, 2, 0])
  })
  test('empty latency buckets stay gaps', () => {
    expect(responseTimes({ avgMs: [10, null, 30] })).toEqual([10, null, 30])
  })
})

describe('proxyRows', () => {
  test('busiest first, with the share of all requests', () => {
    const rows = proxyRows(traffic)
    expect(rows.map((r) => r.name)).toEqual(['Beta', 'Alpha', 'Other hosts', 'Gamma'])
    expect(rows[0].share).toBeCloseTo(0.8)
    expect(rows[0].disabled).toBe(true)
    expect(rows[1].errorShare).toBeCloseTo(0.1)
  })
  test('is empty without a report', () => {
    expect(proxyRows(null)).toEqual([])
  })
})

describe('changeText', () => {
  test('says how much more or less than the period before', () => {
    expect(changeText(120, 100, '24h')).toBe('+20% vs previous 24 hours')
    expect(changeText(75, 100, '1h')).toBe('-25% vs previous 1 hour')
    expect(changeText(100, 100, '7d')).toBe('No change vs previous 7 days')
    expect(changeText(100.4, 100, '7d')).toBe('No change vs previous 7 days')
  })
  test('has nothing to say without a period before, or when it was empty', () => {
    expect(changeText(5, null, '24h')).toBeNull()
    expect(changeText(5, undefined, '24h')).toBeNull()
    expect(changeText(0, 0, '24h')).toBe('No change vs previous 24 hours')
    expect(changeText(5, 0, '24h')).toBe('None in the previous 24 hours')
  })
  test('large changes read as plain numbers', () => {
    expect(changeText(1500, 100, '6h')).toBe('+1,400% vs previous 6 hours')
  })
})

describe('pointsChange', () => {
  test('compares two shares in percentage points', () => {
    expect(pointsChange(0.05, 0.02, '24h')).toBe('+3.0 points vs previous 24 hours')
    expect(pointsChange(0.01, 0.03, '24h')).toBe('-2.0 points vs previous 24 hours')
    expect(pointsChange(null, 0.03, '24h')).toBeNull()
    expect(pointsChange(0.03, null, '24h')).toBeNull()
  })
})

describe('heatmap', () => {
  const localHour = (y, m, d, h) => Math.floor(new Date(y, m, d, h).getTime() / 1000)

  test('places each hour on its local day and hour', () => {
    const from = localHour(2026, 10, 2, 22)
    const grid = heatmap({ hourlyFrom: from, hourly: [5, 7, 3, 0] })
    expect(grid.days).toHaveLength(2)
    expect(grid.days[0].cells[22]).toMatchObject({ count: 5 })
    expect(grid.days[0].cells[23]).toMatchObject({ count: 7 })
    expect(grid.days[1].cells[0]).toMatchObject({ count: 3 })
    expect(grid.max).toBe(7)
    expect(grid.busiest).toMatchObject({ count: 7, hour: 23 })
  })

  test('hours outside the data are empty, not zero-filled with a fake count', () => {
    const grid = heatmap({ hourlyFrom: localHour(2026, 10, 2, 22), hourly: [5] })
    expect(grid.days[0].cells[3]).toBeNull()
  })

  test('with no traffic there is no busiest hour', () => {
    const grid = heatmap({ hourlyFrom: localHour(2026, 10, 2, 10), hourly: [0, 0] })
    expect(grid.max).toBe(0)
    expect(grid.busiest).toBeNull()
  })

  test('is empty without data', () => {
    expect(heatmap(null).days).toEqual([])
  })
})

describe('percentileText', () => {
  test('says the figure is an upper bound', () => {
    expect(percentileText(250)).toBe('up to 250 ms')
    expect(percentileText(2500)).toBe('up to 2.5 s')
    expect(percentileText(10000)).toBe('up to 10 s')
    expect(percentileText(null)).toBeNull()
  })
})
