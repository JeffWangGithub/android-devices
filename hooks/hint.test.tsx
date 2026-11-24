import { expect, test } from 'claude-code/testing'

const SAMPLE = `List of devices attached
SWHUIJB6PREEV46X       device usb:1 product:PGKM10 model:PGKM10 transport_id:7
`

const BAND = {
  plugin: 'android-devices',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 5 },
    view: {},
  },
} as const

/* eslint-disable @typescript-eslint/no-explicit-any */
const mocks = (on: any, run: any) => {
  on('command.register', () => ({ value: { command: 'android-devices' } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('env.get', () => ({ value: '/home/tester' }))
  on('process.run', run)
}

test('draws devices in the band above the prompt', async ($, on) => {
  mocks(on, (_: any, e: any) => {
    const prop = e.argv.at(-1)
    const stdout = e.argv.includes('getprop')
      ? prop === 'ro.product.manufacturer'
        ? 'OnePlus\n'
        : 'PGKM10\n'
      : SAMPLE
    return {
      value: {
        exitCode: 0,
        stdout,
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount(BAND)
  expect(
    (await ui.find({ type: 'Text', text: /OnePlus PGKM10/ }))?.text,
  ).toBe('OnePlus PGKM10')
  expect(
    (await ui.find({ type: 'Text', text: /SWHUIJB6PREEV46X/ }))?.text,
  ).toContain('SWHUIJB6PREEV46X')
  expect((await ui.find({ type: 'Text', text: /在线/ }))?.text).toContain('在线')
  await ui.unmount()
})

test('says so when no device is connected', async ($, on) => {
  mocks(on, () => ({
    value: {
      exitCode: 0,
      stdout: 'List of devices attached\n',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount(BAND)
  expect(
    (await ui.find({ type: 'Text', text: /未连接 Android 设备/ }))?.text,
  ).toContain('未连接 Android 设备')
  await ui.unmount()
})

test('shows why adb failed', async ($, on) => {
  mocks(on, () => ({ deny: 'adb not found' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount(BAND)
  const row = await ui.find({ type: 'Text', text: /adb 调用失败/ })
  expect(row?.text).toContain('adb not found')
  await ui.unmount()
})

test('starts reading from the first band draw', async ($, on) => {
  let calls = 0
  mocks(on, () => {
    calls += 1
    return {
      value: {
        exitCode: 0,
        stdout: 'List of devices attached\n',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })

  const ui = await $.ui.mount(BAND)
  expect(calls).toBeGreaterThan(0)
  await ui.unmount()
})

test('the shot button captures and pulls a screenshot', async ($, on) => {
  const calls: string[][] = []
  mocks(on, (_: any, e: any) => {
    calls.push([...e.argv])
    return {
      value: {
        exitCode: 0,
        stdout: e.argv.includes('devices') ? SAMPLE : '',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'shot:SWHUIJB6PREEV46X' })

  expect(calls.some(argv => argv.includes('screencap'))).toBe(true)
  expect(
    calls.some(
      argv => argv.includes('pull') && argv.at(-1)?.startsWith('/home/tester/'),
    ),
  ).toBe(true)
  await ui.unmount()
})
