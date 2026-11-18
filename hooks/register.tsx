import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { parseDevices } from './parse'
import type { AndroidDevice, DeviceSnapshot } from '../types'

const NAME = 'android-devices'
const POLL_MS = 2500

const snapshot = atom(
  { plugin: 'android-devices', key: 'snapshot' } as const,
  { devices: [] } as DeviceSnapshot,
  { shape: 'snapshot-1' },
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
    await $.command.register({
      name: NAME,
      description: '显示已连接的 Android 设备',
    })
    await refresh($)
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

  // The prompt hint line is the lowest one: keep the engine's line and draw
  // the devices on a row of their own under it.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const line = await next(e)
    const { devices, error } = await read($, snapshot)
    const { Box, Text } = $.ui.resolve(e)
    const list = sorted(devices)

    return (
      <Box flexDirection="column">
        {line}
        <Box flexDirection="row">
          <Text dimColor>📱 </Text>
          {error && (
            <Text color="red" maxLines={1}>
              {error}
            </Text>
          )}
          {!error && list.length === 0 && (
            <Text dimColor maxLines={1}>
              未连接 Android 设备
            </Text>
          )}
          {!error &&
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
                </Box>
              )
            })}
          {!error && list.length > 3 && (
            <Text dimColor maxLines={1}>
              {'  '}+{list.length - 3}
            </Text>
          )}
        </Box>
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
    const devices = await enrich($, parseDevices(stdout))
    await update($, snapshot, value => ({
      ...value,
      devices,
      error: undefined,
    }))
  } catch (error) {
    await update($, snapshot, value => ({ ...value, error: describe(error) }))
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

function describe(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text ? `adb 调用失败：${text}` : 'adb 调用失败'
}
