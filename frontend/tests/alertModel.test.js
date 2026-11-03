/* global describe, test, expect */
import { alertMarkers, inWindow, conditionLabel, daysForRange } from '../src/utils/alertModel'

const from = 1_800_000_000
const at = (offset, over = {}) => ({ id: String(offset), firedAt: new Date((from + offset) * 1000).toISOString(), ruleName: 'R', conditionType: 'error_rate', proxyName: 'P', summary: 's', ...over })

describe('alertMarkers', () => {
  const window = { from, bucketSeconds: 60, count: 10 }

  test('puts each event in its step and joins events of the same step', () => {
    const markers = alertMarkers([at(5), at(30), at(125)], window)
    expect(markers.map((m) => [m.index, m.events.length])).toEqual([[0, 2], [2, 1]])
  })

  test('drops events before the window or after its last step', () => {
    expect(alertMarkers([at(-1), at(600), at(9999)], window)).toEqual([])
    expect(alertMarkers([at(599)], window)[0].index).toBe(9)
  })

  test('ignores unparsable times and no events', () => {
    expect(alertMarkers([{ firedAt: 'garbage' }], window)).toEqual([])
    expect(alertMarkers(null, window)).toEqual([])
  })
})

test('inWindow keeps the events of the window, newest first', () => {
  const list = inWindow([at(10), at(100), at(-5)], { from, to: from + 200 })
  expect(list.map((e) => e.id)).toEqual(['100', '10'])
})

test('labels and ranges', () => {
  expect(conditionLabel('upstream_down')).toBe('Upstream down')
  expect(conditionLabel('new_kind')).toBe('new_kind')
  expect(daysForRange('7d')).toBe(7)
  expect(daysForRange('24h')).toBe(1)
})
