import { expect, test } from 'claude-code/testing'

const SAMPLE = `List of devices attached
SWHUIJB6PREEV46X       device usb:1 product:PGKM10 model:PGKM10 transport_id:7
`

const ok = (stdout = '') => ({
  value: {
    exitCode: 0,
    stdout,
    stderr: '',
    isStdoutTruncated: false,
    isStderrTruncated: false,
  },
})

/* eslint-disable @typescript-eslint/no-explicit-any */
const run = ($: any, command: string, args = '') =>
  $.command.run({
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })

const setup = (on: any, calls: string[][]) => {
  const registered: string[] = []
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_: any, e: any) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('env.get', () => ({ value: '/home/tester' }))
  on('ui.toast', () => ok())
  on('ui.invalidate', () => ok())
  on('ui.close', () => ok())
  on('clock.every', () => ok())
  on('process.run', (_: any, e: any) => {
    calls.push([...e.argv])
    return ok(e.argv.includes('devices') ? SAMPLE : '')
  })
  return registered
}

test('registers the device, shot and record commands', async ($, on) => {
  const registered = setup(on, [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(registered).toEqual([
    'android-devices',
    'android-devices-shot',
    'android-devices-record',
  ])
})

test('saves a screenshot under ~/.claude/android-devices', async ($, on) => {
  const calls: string[][] = []
  setup(on, calls)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const { text } = await run($, 'android-devices-shot')

  expect(text).toContain(
    '/home/tester/.claude/android-devices/shot-SWHUIJB6PREEV46X-',
  )
  expect(calls.some(argv => argv.includes('screencap'))).toBe(true)
  expect(calls.some(argv => argv.includes('pull'))).toBe(true)
})

test('records for the asked seconds and pulls the file', async ($, on) => {
  const calls: string[][] = []
  setup(on, calls)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const { text } = await run($, 'android-devices-record', '7')

  const screenrecord = calls.find(argv => argv.includes('screenrecord'))
  expect(screenrecord).toContain('7')
  expect(text).toContain('/home/tester/.claude/android-devices/record-')
  expect(text).toContain('（7s）')
  expect(calls.some(argv => argv.includes('pull'))).toBe(true)
})
