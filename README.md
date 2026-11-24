# android-devices

在 Claude Code 输入框上方的条带（`AbovePrompt`）里显示当前连接的 Android 设备：状态圆点、品牌、型号、序列号和连接状态，每 2.5 秒刷新；每台在线设备后面跟一个「截图」按钮，点一下就能截屏。

Show connected Android devices in the band above the Claude Code prompt, with a one-click screenshot button per device.

## 安装

在 Claude Code 里执行：

```
/plugin install android-devices --marketplace JeffWangGithub/android-devices
```

本地开发或不想装 marketplace 时：

```
claude --plugin-dir /path/to/android-devices
```

## 用法

- 安装后自动显示，无需操作。
- 点击设备后面的「截图」按钮即可截屏，路径会打印成一条系统提示。
- 输入 `/android-devices` 可把完整设备列表（序列号、品牌、型号、状态）打印到对话里。
- 输入 `/android-devices-shot [序列号]` 通过 adb 截屏，保存为 PNG，并打印文件路径（Claude 可直接用 Read 查看）。
- 输入 `/android-devices-record [序列号] [秒数]` 通过 adb 录屏，默认 10 秒，最长 180 秒，保存为 MP4。
- 截屏和录屏默认落在 `~/.claude/android-devices/`。
- 只有一台在线设备时序列号可省略；多台时命令会提示带上序列号。
- 最多显示 3 台，更多时追加 `+N`。

## 前置条件

- 本机安装 `adb`（Android Platform Tools），并在 `PATH` 中。
- 设备开启 USB 调试；首次连接时在手机上允许调试授权。
- 录屏依赖设备自带的 `screenrecord`；部分定制 ROM 会移除它或让它崩溃（报 `not found` / `Segmentation fault`），此时录屏命令会直接报错，截屏不受影响。

## 状态颜色

| 颜色 | 状态 | 含义 |
|---|---|---|
| 绿色 `●` | `device` | 在线 |
| 黄色 `◐` | `unauthorized` | 未授权，需在手机上确认 |
| 灰色 `○` | `offline` | 离线 |
| 红色 `⚠` | `no permissions` | 无权限 |

序列号为暗色；adb 调用失败时整行显示红色错误信息，并保留下一次刷新。

## 开发

```
claude plugin validate .
claude plugin test .
```

MIT License.
