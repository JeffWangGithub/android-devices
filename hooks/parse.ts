import type { AndroidDevice } from '../types'

const HEADER = 'List of devices attached'

/** Parses `adb devices -l` output. Unknown or malformed lines are skipped. */
export function parseDevices(stdout: string): AndroidDevice[] {
  const lines = stdout.split(/\r?\n/)
  const start = lines.findIndex(line => line.trim() === HEADER)
  if (start < 0) return []

  const devices: AndroidDevice[] = []
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim()
    if (!line || line.startsWith('*')) continue

    const parts = line.split(/\s+/)
    const serial = parts[0]
    // "SERIAL no permissions (user in plugdev group...)" is one state, not three.
    const state = parts[1] === 'no' ? 'no permissions' : parts[1]
    if (!serial || !state) continue

    const model = parts
      .slice(2)
      .find(part => part.startsWith('model:'))
      ?.slice('model:'.length)
    devices.push(model ? { serial, state, model } : { serial, state })
  }
  return devices
}
