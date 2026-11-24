import type { AndroidDevice } from '../types'

export type Target = { serial: string } | { error: string }

/** Picks the device a command works on: the serial given, or the only online one. */
export function pickTarget(
  devices: AndroidDevice[],
  wanted?: string,
): Target {
  const online = devices.filter(device => device.state === 'device')
  if (wanted) {
    return online.some(device => device.serial === wanted)
      ? { serial: wanted }
      : { error: `设备 ${wanted} 不在线。` }
  }
  if (online.length === 1) return { serial: online[0]!.serial }
  if (online.length === 0) return { error: '没有在线设备。' }

  return {
    error: `有多台在线设备，请带上序列号：${online
      .map(device => device.serial)
      .join('、')}`,
  }
}

export type RecordArgs = { serial?: string; seconds: number }

/** `/record [serial] [seconds]`; default 10 s, adb's own cap is 180 s. */
export function parseRecordArgs(args: string): RecordArgs {
  const tokens = args.trim().split(/\s+/).filter(Boolean)
  const seconds = tokens
    .map(token => Number(token))
    .find(value => Number.isInteger(value) && value > 0)

  return {
    serial: tokens.find(token => !/^\d+$/.test(token)),
    seconds: Math.min(180, Math.max(1, seconds ?? 10)),
  }
}
