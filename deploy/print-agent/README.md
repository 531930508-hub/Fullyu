# 时叙门店杯贴打印代理（芯烨 XP-420B）

营业台 Windows 电脑上跑的小脚本：每 1.5 秒向云端取一张待打杯贴，**直接写 USB 打印机**出纸，再回执。

## 为什么不是云打印

芯烨 XP-420B 只有 USB 口，没有网口/4G，云端服务器（公网）物理上够不到它。
飞鹅那类「云打印」卖的是整机里自带联网模块的机器，XP-420B 不是。

所以链路是反的：

```
小程序下单 → 云端生成杯贴 TSPL → (队列) → 门店代理领取 → USB → XP-420B 出纸 → 回执 → 订单标记已打印
```

好处是**不会假成功**：吧台没出纸，订单就一直停在「待打印」，补打/死信都有记录。

## 一次性安装（每店一台收银电脑）

1. **装驱动**：芯烨官网下 XP-420B 的 Windows 驱动（走 USB），装完在「设备和打印机」里能看到打印机。
   建议把打印机名改成 `XP-420B`（`agent.config.json` 里要一字不差地对上）。
   - 纸张：`40mm × 60mm` 不干胶，间距 2mm，间距偏移 0mm；方向纵向。
   - 不要在驱动里设「缩放」，脚本发的是原始指令（RAW），驱动只负责搬运字节。
2. **服务端**（`apps/server/.env`）：
   ```
   INTEGRATIONS_PRINTER_MODE="live"
   PRINTER_DRIVER="agent"
   PRINT_AGENT_TOKENS='{"sh":"<openssl rand -hex 24>"}'
   ```
   改完重启 API。令牌等于这家店的打印身份，泄露了换掉即可（旧令牌立刻失效）。
3. **拷贝本目录**到营业台，例如 `C:\teahour\print-agent\`：
   - 复制 `agent.config.example.json` → `agent.config.json`，填 `apiBase`、`storeId`、`token`、`printerName`。
   - `encoding` 保持 `gb18030`（中文点阵字体按 GB 码解释；发 UTF-8 会印成乱码）。
4. **自检**（第一次必须做）：
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\xprinter-agent.ps1 -Test
   ```
   出一张自检标签，核对三件事：
   - 中文是字，不是方块/乱码 → 否则是字体或编码问题（见下）；
   - 二维码能扫出 `A001-1`；
   - 左边距约 2.5mm，字不糊。
5. **常驻**：右键 `install-task.ps1` →「使用 PowerShell 运行」（管理员），注册登录自启的计划任务；或直接把
   ```powershell
   powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File .\xprinter-agent.ps1
   ```
   放进「启动」文件夹。
6. **验收**：下真单，看吧台是否立刻出纸，后台订单打印状态是否变「已打印」。

## 排障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 日志「令牌无效」 | token 与服务端 `PRINT_AGENT_TOKENS` 不一致 | 重新生成并同时更新两端 |
| 日志「系统里找不到打印机」 | `printerName` 与系统名不一致 | 「设备和打印机」里复制准确名称 |
| 中文变方块 | 机身固件没有该中文字体 | 换 `TSPL_FONT_CN` 为 `TST24.BF2` 服务端重发；或核对机器是否 TSPL 固件（不是 ZPL） |
| 中文变乱码 | 编码不对 | 确认 `encoding=gb18030`；某些固件吃 UTF-8，试 `utf8` |
| 出白纸/字很淡 | 浓度低或纸装反 | 服务端 `TSPL_DENSITY` 调到 9–10；热敏面朝打印头 |
| 标签内容偏一边 | 纸宽/间距与实际纸卷不符 | 调 `TSPL_LABEL_WIDTH_MM` / `TSPL_LABEL_GAP_MM`，用 `-Test` 复验 |
| 一张单打两遍 | 同店开了两个代理 | 每个工位配自己的 printerName；同一台机只能跑一个代理 |

## 安全边界

- 代理只有「领本店任务 / 回执」两种权限，没有后台账号；
- 令牌比较在服务端做哈希后定长时间比较，跨店领取与跨店回执都会被拒绝；
- 杯贴内容里只有昵称（`茶客` 兜底），手机号与全名永远不进打印队列。