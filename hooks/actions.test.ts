import { expect, test } from 'claude-code/testing'

import { parseRecordArgs, pickTarget } from './actions'

const ONE = [{ serial: 'ABC', state: 'device' }]
const TWO = [
  { serial: 'ABC', state: 'device' },
  { serial: 'DEF', state: 'device' },
  { serial: 'GHI', state: 'unauthorized' },
]

test('uses the only online device', async () => {
  expect(pickTarget(ONE)).toEqual({ serial: 'ABC' })
  expect(pickTarget(TWO, 'DEF')).toEqual({ serial: 'DEF' })
})

test('asks for a serial when several are online', async () => {
  expect(pickTarget(TWO)).toHaveProperty('error')
  expect(pickTarget(TWO, 'NOPE')).toHaveProperty('error')
  expect(pickTarget([])).toHaveProperty('error')
})

test('recording defaults to 10 seconds and caps at 180', async () => {
  expect(parseRecordArgs('')).toEqual({ seconds: 10 })
  expect(parseRecordArgs('ABC')).toEqual({ serial: 'ABC', seconds: 10 })
  expect(parseRecordArgs('30 ABC')).toEqual({ serial: 'ABC', seconds: 30 })
  expect(parseRecordArgs('ABC 5')).toEqual({ serial: 'ABC', seconds: 5 })
  expect(parseRecordArgs('9999')).toEqual({ seconds: 180 })
})
