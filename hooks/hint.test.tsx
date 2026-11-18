import { expect, test } from 'claude-code/testing'

const SAMPLE = `List of devices attached
SWHUIJB6PREEV46X       device usb:1 product:PGKM10 model:PGKM10 transport_id:7
`

const HINT = {
  plugin: 'android-devices',
  component: 'PromptHint',
  surface: 'terminal',
  props: {
    isDraft: false,
    isWorking: false,
    hint: 'bypass permissions on (shift+tab to cycle)',
  },
} as const

/* eslint-disable @typescript-eslint/no-explicit-any */
const mocks = (on: any, run: any) => {
  on('command.register', () => ({ value: { command: 'android-devices' } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('process.run', run)
}

test('draws devices on their own row under the hint line', async ($, on) => {
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

  const ui = await $.ui.mount(HINT)
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

  const ui = await $.ui.mount(HINT)
  expect(
    (await ui.find({ type: 'Text', text: /未连接 Android 设备/ }))?.text,
  ).toContain('未连接 Android 设备')
  await ui.unmount()
})

test('shows why adb failed', async ($, on) => {
  mocks(on, () => ({ deny: 'adb not found' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount(HINT)
  const row = await ui.find({ type: 'Text', text: /adb 调用失败/ })
  expect(row?.text).toContain('adb not found')
  await ui.unmount()
})
