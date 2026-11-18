export type AndroidDevice = {
  serial: string
  state: string
  brand?: string
  model?: string
}

export type DeviceSnapshot = {
  devices: AndroidDevice[]
  loaded: boolean
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'android-devices': { snapshot: Shaped<DeviceSnapshot> }
  }
}
