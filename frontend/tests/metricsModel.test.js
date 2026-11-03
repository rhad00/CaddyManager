/* global describe, test, expect */
import {
  DASH, formatCount, formatBytes, formatDuration, formatPercent,
  statusBreakdown, verdict, historySeries, timeLabels, ageText,
} from '../src/utils/metricsModel'

describe('formatting', () => {
  test('missing data is a dash, never zero', () => {
    expect(formatCount(undefined)).toBe(DASH)
    expect(formatBytes(null)).toBe(DASH)
    expect(formatDuration(NaN)).toBe(DASH)
    expect(formatPercent(undefined)).toBe(DASH)
    expect(formatCount(0)).toBe('0')
  })

  test('bytes use their real 1024-based unit names', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KiB')
    expect(formatBytes(73400320)).toBe('70.0 MiB')
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GiB')
    expect(formatBytes(-1)).toBe(DASH)
    expect(formatBytes(1e30)).toMatch(/TiB$/)
  })

  test('durations read as milliseconds under a second', () => {
    expect(formatDuration(0.012345)).toBe('12.3 ms')
    expect(formatDuration(0.0005)).toBe('0.50 ms')
    expect(formatDuration(0.25)).toBe('250 ms')
    expect(formatDuration(1.5)).toBe('1.50 s')
  })

  test('percentages keep detail for small shares', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(213 / 48213)).toBe('0.44%')
    expect(formatPercent(0.25)).toBe('25.0%')
  })

  test('counts are grouped', () => {
    expect(formatCount(48213)).toBe('48,213')
  })
})

describe('statusBreakdown', () => {
  test('gives shares, and null for a class the API did not report', () => {
    const rows = statusBreakdown({ '2xx': 90, '3xx': 10 })
    expect(rows.find((r) => r.cls === '2xx').share).toBeCloseTo(0.9)
    expect(rows.find((r) => r.cls === '4xx')).toMatchObject({ count: null, share: null })
  })
  test('has no shares when nothing was counted', () => {
    expect(statusBreakdown({ '2xx': 0 }).every((r) => r.share === null)).toBe(true)
  })
})

describe('verdict', () => {
  const withStatus = (s) => ({ http: { responseStatus: s } })
  test('no data is not a healthy site', () => {
    expect(verdict(null).tone).toBe('unknown')
    expect(verdict({ http: {} }).tone).toBe('unknown')
  })
  test('no requests yet', () => {
    expect(verdict(withStatus({ '2xx': 0, '5xx': 0 }))).toMatchObject({ tone: 'ok', label: 'Idle' })
  })
  test('no 5xx is healthy', () => {
    expect(verdict(withStatus({ '2xx': 100, '5xx': 0 })).label).toBe('Healthy')
  })
  test('small 5xx share is stated and still healthy', () => {
    const v = verdict(withStatus({ '2xx': 45000, '3xx': 1200, '4xx': 1800, '5xx': 213 }))
    expect(v.tone).toBe('ok')
    expect(v.text).toMatch(/0\.44% of responses were server errors/)
  })
  test('1% warns and 5% is an error', () => {
    expect(verdict(withStatus({ '2xx': 98, '5xx': 2 })).tone).toBe('warn')
    expect(verdict(withStatus({ '2xx': 90, '5xx': 10 })).tone).toBe('bad')
  })
})

describe('historySeries', () => {
  const at = (iso, total, mem) => ({
    timestamp: iso,
    metrics: {
      ...(total === undefined ? {} : { caddy_http_requests_total: [{ value: total }] }),
      ...(mem === undefined ? {} : { process_resident_memory_bytes: [{ value: mem }] }),
    },
  })

  test('sorts by time and turns the counter into a per-minute rate', () => {
    const points = historySeries([
      at('2026-11-03T11:00:00Z', 1600, 2 * 1048576),
      at('2026-11-03T10:00:00Z', 1000, 1 * 1048576),
    ])
    expect(points.map((p) => p.perMinute)).toEqual([null, 10])
    expect(points.map((p) => p.memoryMiB)).toEqual([1, 2])
  })

  test('a counter that drops (Caddy restarted) leaves a gap, not a cliff', () => {
    const points = historySeries([
      at('2026-11-03T10:00:00Z', 5000),
      at('2026-11-03T11:00:00Z', 20),
      at('2026-11-03T12:00:00Z', 140),
    ])
    expect(points.map((p) => p.perMinute)).toEqual([null, null, 2])
  })

  test('a missing sample is null, not zero', () => {
    const [p] = historySeries([at('2026-11-03T10:00:00Z')])
    expect(p.memoryMiB).toBeNull()
  })

  test('ignores bad entries and non-arrays', () => {
    expect(historySeries(undefined)).toEqual([])
    expect(historySeries([{ timestamp: 'nope' }])).toEqual([])
  })
})

describe('labels and age', () => {
  test('adds the day only when the series crosses midnight', () => {
    const d = (h, day = 3) => ({ time: new Date(2026, 10, day, h, 5) })
    expect(timeLabels([d(9), d(10)])).toEqual(['09:05', '10:05'])
    expect(timeLabels([d(23), d(1, 4)])).toEqual(['3 Nov 23:05', '4 Nov 01:05'])
  })
  test('age reads in the largest sensible unit', () => {
    expect(ageText(1000, 13000)).toBe('12 s ago')
    expect(ageText(0, 180000)).toBe('3 min ago')
    expect(ageText(0, 2 * 3600000)).toBe('2 h ago')
  })
})
