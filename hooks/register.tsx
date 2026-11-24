import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { parseRecordArgs, pickTarget } from './actions'
import { parseDevices } from './parse'
import type { AndroidDevice, DeviceSnapshot } from '../types'

const NAME = 'android-devices'
const SHOT = 'android-devices-shot'
const RECORD = 'android-devices-record'
const POLL_MS = 2500
// Files land outside the project so a screenshot never dirties a repo.
const DIR = '.claude/android-devices'

const snapshot = atom(
  { plugin: 'android-devices', key: 'snapshot' } as const,
  { devices: [], loaded: false } as DeviceSnapshot,
  { shape: 'snapshot-2' },
)

// A hung adb can outlast the interval; one poll at a time.
let polling = false
// Brand and model need two extra adb calls, so they are fetched once per serial.
const INFO = new Map<string, { brand?: string; model?: string }>()

const LOOKS: Record<string, { label: string; dot: string; color: string }> = {
  device: { label: '在线', dot: '●', color: 'green' },
  unauthorized: { label: '未授权', dot: '◐', color: 'yellow' },
  offline: { label: '离线', dot: '○', color: 'gray' },
  'no permissions': { label: '无权限', dot: '⚠', color: 'red' },
}

const RANK: Record<string, number> = {
  device: 0,
  unauthorized: 1,
  offline: 2,
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // The pane version opened a pane; hot reload keeps the old pane open.
    await $.ui.close({ id: NAME }).catch(() => {})
    await Promise.all([
      $.command.register({
        name: NAME,
        description: '显示已连接的 Android 设备',
      }),
      $.command.register({
        name: SHOT,
        description: '通过 adb 截取 Android 屏幕，保存为 PNG',
        argumentHint: '[serial]',
      }),
      $.command.register({
        name: RECORD,
        description: '通过 adb 录制 Android 屏幕，保存为 MP4',
        argumentHint: '[serial] [seconds]',
      }),
    ])
    await poll($)
    $.clock.every(POLL_MS, () => poll($))

    return next(e)
  })

  on('command.run', { command: NAME }, async $ => {
    await refresh($)
    const { devices, error } = await read($, snapshot)

    return { text: summarize(devices, error) }
  }).catch(($, e, next) =>
    next.called ? next(e) : { text: 'Android 设备读取失败。' },
  )

  on('command.run', { command: SHOT }, async ($, e) => {
    const target = await targetOf($, e.args.trim())
    if ('error' in target) return { text: target.error }

    const result = await capture($, target.serial)
    if ('error' in result) return { text: `截图失败：${result.error}` }

    $.ui.toast(`已保存截图 ${result.file}`)
    return {
      text: `截图已保存：${result.file}`,
      context: [`Android 截图保存在 ${result.file}，可以直接用 Read 查看。`],
    }
  }).catch(($, e, next) => (next.called ? next(e) : { text: '截图失败。' }))

  on('command.run', { command: RECORD }, async ($, e) => {
    const { serial, seconds } = parseRecordArgs(e.args)
    const target = await targetOf($, serial)
    if ('error' in target) return { text: target.error }

    const dir = await dataDir($)
    if (typeof dir !== 'string') return { text: dir.error }

    const stamp = Date.now()
    const remote = `/sdcard/android-devices-${stamp}.mp4`
    const file = `${dir}/record-${target.serial}-${stamp}.mp4`
    try {
      await $.process.run(['mkdir', '-p', dir], { timeoutMs: 5000 })
      $.ui.toast(`正在录制 ${seconds}s…`, { timeoutMs: seconds * 1000 })
      const record = await $.process.run(
        [
          'adb',
          '-s',
          target.serial,
          'shell',
          'screenrecord',
          '--time-limit',
          String(seconds),
          '--bit-rate',
          '8000000',
          remote,
        ],
        { timeoutMs: seconds * 1000 + 15000 },
      )
      if (record.exitCode !== 0) {
        return {
          text: `录制失败：${reason(record)}${recordHint(record)}`,
        }
      }
      const pull = await $.process.run(
        ['adb', '-s', target.serial, 'pull', remote, file],
        { timeoutMs: 60000 },
      )
      if (pull.exitCode !== 0) {
        return { text: `录制文件拉取失败：${reason(pull)}` }
      }
      $.ui.toast(`已保存录屏 ${file}`)
      return {
        text: `录屏已保存：${file}（${seconds}s）`,
        context: [`Android 录屏保存在 ${file}（${seconds}s）。`],
      }
    } catch (error) {
      return { text: `录制失败：${messageOf(error)}` }
    } finally {
      await $.process
        .run(['adb', '-s', target.serial, 'shell', 'rm', '-f', remote], {
          timeoutMs: 5000,
        })
        .catch(() => {})
    }
  }).catch(($, e, next) => (next.called ? next(e) : { text: '录制失败。' }))

  // The band above the prompt is where a clickable Button can live.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { devices, loaded, error } = await read($, snapshot)
    // The band can draw before session.start runs; start reading adb here.
    if (!loaded) void poll($)
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = sorted(devices)

    return (
      <Box flexDirection="row">
        <Text dimColor>📱 </Text>
        {error && (
          <Text color="red" maxLines={1}>
            {error}
          </Text>
        )}
        {!error && !loaded && (
          <Text dimColor maxLines={1}>
            读取中…
          </Text>
        )}
        {!error && loaded && list.length === 0 && (
          <Text dimColor maxLines={1}>
            未连接 Android 设备
          </Text>
        )}
        {!error &&
          loaded &&
          list.slice(0, 3).map((device, index) => {
            const look = LOOKS[device.state]
            const color = look?.color ?? 'gray'
            const name = nameOf(device)
            return (
              <Box key={device.serial} flexDirection="row">
                {index > 0 && <Text dimColor>  ·  </Text>}
                <Text color={color}>{look?.dot ?? '●'} </Text>
                <Text maxLines={1}>{name}</Text>
                {name !== device.serial && (
                  <Text dimColor maxLines={1}>
                    {' '}
                    {device.serial}
                  </Text>
                )}
                <Text color={color} maxLines={1}>
                  {' '}
                  {look?.label ?? device.state}
                </Text>
                {device.state === 'device' && (
                  <Button
                    key={`shot:${device.serial}`}
                    plain
                    onPress={() => void shotFromBand($, device.serial)}
                  >
                    {' 截图'}
                  </Button>
                )}
              </Box>
            )
          })}
        {!error && loaded && list.length > 3 && (
          <Text dimColor maxLines={1}>
            {'  '}+{list.length - 3}
          </Text>
        )}
      </Box>
    )
  })
}

function sorted(devices: AndroidDevice[]): AndroidDevice[] {
  return [...devices].sort(
    (a, b) =>
      (RANK[a.state] ?? 3) - (RANK[b.state] ?? 3) ||
      a.serial.localeCompare(b.serial),
  )
}

function nameOf(device: AndroidDevice): string {
  return [device.brand, device.model].filter(Boolean).join(' ') || device.serial
}

function summarize(devices: AndroidDevice[], error?: string): string {
  if (error) return `Android 设备读取失败：${error}`
  if (devices.length === 0) return '未检测到 Android 设备。'
  const rows = sorted(devices).map(device =>
    [
      device.serial,
      device.brand,
      device.model,
      LOOKS[device.state]?.label ?? device.state,
    ]
      .filter(Boolean)
      .join('  '),
  )

  return [`Android 设备 (${devices.length})`, ...rows].join('\n')
}

async function poll($: EngineInterface): Promise<void> {
  if (polling) return
  polling = true
  try {
    await refresh($)
  } finally {
    polling = false
  }
}

async function refresh($: EngineInterface): Promise<void> {
  try {
    const { stdout } = await $.process.run(['adb', 'devices', '-l'], {
      timeoutMs: 5000,
    })
    // Draw the list at once; brand and model land a moment later.
    const parsed = parseDevices(stdout)
    await update($, snapshot, value => ({
      ...value,
      devices: parsed,
      loaded: true,
      error: undefined,
    }))
    $.ui.invalidate('ui.render')

    const devices = await enrich($, parsed)
    await update($, snapshot, value => ({ ...value, devices }))
    $.ui.invalidate('ui.render')
  } catch (error) {
    await update($, snapshot, value => ({ ...value, error: describe(error) }))
    $.ui.invalidate('ui.render')
  }
}

async function enrich(
  $: EngineInterface,
  devices: AndroidDevice[],
): Promise<AndroidDevice[]> {
  return Promise.all(
    devices.map(async device => {
      if (device.state !== 'device') return device
      let info = INFO.get(device.serial)
      if (!info) {
        try {
          const [brand, model] = await Promise.all([
            getprop($, device.serial, 'ro.product.manufacturer'),
            getprop($, device.serial, 'ro.product.model'),
          ])
          info = { brand: brand || undefined, model: model || device.model }
        } catch {
          info = { model: device.model }
        }
        INFO.set(device.serial, info)
      }
      return { ...device, brand: info.brand, model: info.model ?? device.model }
    }),
  )
}

async function getprop(
  $: EngineInterface,
  serial: string,
  prop: string,
): Promise<string> {
  const { stdout } = await $.process.run(
    ['adb', '-s', serial, 'shell', 'getprop', prop],
    { timeoutMs: 5000 },
  )
  return stdout.trim()
}

async function capture(
  $: EngineInterface,
  serial: string,
): Promise<{ file: string } | { error: string }> {
  const dir = await dataDir($)
  if (typeof dir !== 'string') return { error: dir.error }

  const stamp = Date.now()
  // Capture on the device: `exec-out screencap` mixes warnings into stdout on
  // devices with several displays, which corrupts the PNG.
  const remote = `/sdcard/android-devices-${stamp}.png`
  const file = `${dir}/shot-${serial}-${stamp}.png`
  try {
    await $.process.run(['mkdir', '-p', dir], { timeoutMs: 5000 })
    const cap = await $.process.run(
      ['adb', '-s', serial, 'shell', 'screencap', '-p', remote],
      { timeoutMs: 20000 },
    )
    if (cap.exitCode !== 0) return { error: reason(cap) }
    const pull = await $.process.run(
      ['adb', '-s', serial, 'pull', remote, file],
      { timeoutMs: 30000 },
    )
    if (pull.exitCode !== 0) return { error: `拉取失败：${reason(pull)}` }
    return { file }
  } catch (error) {
    return { error: messageOf(error) }
  } finally {
    await $.process
      .run(['adb', '-s', serial, 'shell', 'rm', '-f', remote], {
        timeoutMs: 5000,
      })
      .catch(() => {})
  }
}

/** A press in the band: no prompt to answer, so the path goes to the transcript. */
async function shotFromBand(
  $: EngineInterface,
  serial: string,
): Promise<void> {
  $.ui.toast('正在截图…', { timeoutMs: 8000 })
  const result = await capture($, serial)
  if ('error' in result) {
    $.ui.toast(`截图失败：${result.error}`, { timeoutMs: 8000 })
    $.ui.log(`📱 截图失败：${result.error}`)
    return
  }
  $.ui.toast(`已保存截图 ${result.file}`)
  $.ui.log(`📱 截图已保存：${result.file}`)
}

async function targetOf(
  $: EngineInterface,
  wanted?: string,
): Promise<{ serial: string } | { error: string }> {
  await refresh($)
  const { devices, error } = await read($, snapshot)
  if (error) return { error: `Android 设备读取失败：${error}` }
  return pickTarget(devices, wanted)
}

async function dataDir(
  $: EngineInterface,
): Promise<string | { error: string }> {
  const home = await $.env.get('HOME')
  return home ? `${home}/${DIR}` : { error: '找不到 HOME 环境变量。' }
}

function reason(result: { stderr: string; exitCode: number }): string {
  return result.stderr.trim() || `exit code ${result.exitCode}`
}

/** Some ROMs ship no screenrecord, or one that dies on start. */
function recordHint(result: {
  stdout: string
  stderr: string
  exitCode: number
}): string {
  const text = `${result.stdout}${result.stderr}`
  const missing =
    result.exitCode === 139 ||
    result.exitCode === 127 ||
    text.includes('inaccessible') ||
    text.includes('not found')
  return missing ? '（该设备的 screenrecord 不可用，部分 ROM 会崩溃或移除它）' : ''
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function describe(error: unknown): string {
  const text = messageOf(error).trim()
  return text ? `adb 调用失败：${text}` : 'adb 调用失败'
}
