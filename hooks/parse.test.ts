import { expect, test } from 'claude-code/testing'

import { parseDevices } from './parse'

const SAMPLE = `List of devices attached
SWHUIJB6PREEV46X       device usb:1114112X product:PGKM10 model:PGKM10 device:OP5565 transport_id:7

`

test('parses a connected device', async () => {
  expect(parseDevices(SAMPLE)).toEqual([
    { serial: 'SWHUIJB6PREEV46X', state: 'device', model: 'PGKM10' },
  ])
})

test('keeps unauthorized and offline states', async () => {
  const devices = parseDevices(
    'List of devices attached\nABC\tunauthorized\nDEF\toffline usb:1\n',
  )
  expect(devices.map(device => device.state)).toEqual([
    'unauthorized',
    'offline',
  ])
})

test('folds no permissions into one state', async () => {
  const devices = parseDevices(
    'List of devices attached\nABC\tno permissions (user in plugdev group)\n',
  )
  expect(devices[0]?.state).toBe('no permissions')
})

test('skips notices, blank output and missing header', async () => {
  expect(parseDevices('')).toEqual([])
  expect(parseDevices('* daemon started successfully *\n')).toEqual([])
  expect(parseDevices('SERIAL\tdevice\n')).toEqual([])
})

test('keeps a device without a model', async () => {
  expect(
    parseDevices('List of devices attached\nABC\tdevice\n')[0],
  ).toEqual({ serial: 'ABC', state: 'device' })
})
