# android-devices

在 Claude Code 输入框最下面提示行（`bypass permissions on (shift+tab to cycle)`）的下方，单独一行显示当前连接的 Android 设备：状态圆点、品牌、型号、序列号和连接状态，每 2.5 秒刷新。

Show connected Android devices on their own row under the Claude Code prompt.

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
- 输入 `/android-devices` 可把完整设备列表（序列号、品牌、型号、状态）打印到对话里。
- 最多显示 3 台，更多时追加 `+N`。

## 前置条件

- 本机安装 `adb`（Android Platform Tools），并在 `PATH` 中。
- 设备开启 USB 调试；首次连接时在手机上允许调试授权。

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
