/* global describe, test, expect */
import { describeCertificate, needAttention, oldestCheck, dateText } from '../src/utils/certificateModel'

const valid = (daysLeft) => ({ state: 'valid', daysLeft })

describe('describeCertificate', () => {
  test('urgency follows the days left and the bar shrinks with them', () => {
    expect(describeCertificate(valid(60))).toMatchObject({ tone: 'ok', text: '60 days left' })
    expect(describeCertificate(valid(20)).tone).toBe('warn')
    expect(describeCertificate(valid(6)).tone).toBe('urgent')
    expect(describeCertificate(valid(1)).text).toBe('1 day left')
    expect(describeCertificate(valid(0)).text).toBe('Ends today')
    expect(describeCertificate(valid(45)).fraction).toBeCloseTo(0.5)
    expect(describeCertificate(valid(400)).fraction).toBe(1)
  })
  test('expired, failed, unchecked and TLS-less rows say so in words', () => {
    expect(describeCertificate({ state: 'expired', daysLeft: -3 }).text).toBe('Expired 3 days ago')
    expect(describeCertificate({ state: 'expired', daysLeft: -1 }).text).toBe('Expired 1 day ago')
    expect(describeCertificate({ state: 'failed', error: 'timeout' }).text).toBe('Check failed: timeout')
    expect(describeCertificate({ state: 'unchecked' }).text).toBe('Not checked yet')
    expect(describeCertificate({ state: 'not_used' }).text).toMatch(/does not use TLS/)
  })
})

describe('needAttention', () => {
  test('counts expired, failed and soon-ending certificates only', () => {
    const rows = [valid(5), valid(29), valid(30), { state: 'expired', daysLeft: -1 }, { state: 'failed' }, { state: 'unchecked' }, { state: 'not_used' }]
    expect(needAttention(rows)).toBe(4)
  })
})

describe('oldestCheck', () => {
  test('is the oldest stored check, or null when any is missing', () => {
    const a = '2026-11-03T10:00:00.000Z'
    const b = '2026-11-01T10:00:00.000Z'
    expect(oldestCheck([{ state: 'valid', checkedAt: a }, { state: 'valid', checkedAt: b }, { state: 'not_used', checkedAt: null }])).toBe(new Date(b).getTime())
    expect(oldestCheck([{ state: 'valid', checkedAt: a }, { state: 'unchecked', checkedAt: null }])).toBeNull()
    expect(oldestCheck([])).toBeNull()
  })
})

test('dateText formats an ISO date and passes null through', () => {
  expect(dateText(null)).toBeNull()
  expect(dateText('2026-11-15T12:00:00.000Z')).toMatch(/Nov 1[45], 2026/)
})
