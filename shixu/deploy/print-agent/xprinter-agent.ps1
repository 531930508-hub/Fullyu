#requires -version 5.1
<#
  时叙门店杯贴打印代理（芯烨 XP-420B）
  ------------------------------------------------------------
  为什么要有这个东西：
  打印机是 USB 直连营业台电脑的，云端服务器在公网，物理上碰不到 USB 口。
  所以方向反过来：本脚本每隔 1–2 秒向服务器取一张待打杯贴（TSPL 指令已由服务端渲染好），
  转成打印机要的 GB18030 字节，走 Windows 打印后台（spooler）的 RAW 通道直接出纸，然后回执。

  用法：
    powershell -ExecutionPolicy Bypass -File .\xprinter-agent.ps1            # 常驻轮询
    powershell -ExecutionPolicy Bypass -File .\xprinter-agent.ps1 -Once      # 只跑一轮（排障）
    powershell -ExecutionPolicy Bypass -File .\xprinter-agent.ps1 -Test      # 打一张自检标签
#>
[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'agent.config.json'),
  [switch]$Once,
  [switch]$Test
)

$ErrorActionPreference = 'Stop'
# 老系统（Win7/Server 2012）默认只开 TLS 1.0，会被 Nginx 直接掐断连接。
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

$script:LogPath = Join-Path $PSScriptRoot 'agent.log'

function Write-Log {
  param([string]$Message, [string]$Level = 'INFO')
  $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
  Write-Host $line
  try {
    if ((Test-Path $script:LogPath) -and ((Get-Item $script:LogPath).Length -gt 2MB)) {
      Move-Item -Path $script:LogPath -Destination ($script:LogPath + '.1') -Force
    }
    Add-Content -Path $script:LogPath -Value $line -Encoding UTF8
  } catch {
    # 日志写不进去不能影响出纸
  }
}

# ---------------------------------------------------------------- 配置
if (-not (Test-Path $ConfigPath)) {
  throw "找不到配置文件：$ConfigPath（复制 agent.config.example.json，改好 apiBase / token / printerName）"
}
$config = Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json

$apiBase = ([string]$config.apiBase).Trim().TrimEnd('/')
$token = ([string]$config.token).Trim()
$printerName = ([string]$config.printerName).Trim()
$storeId = ([string]$config.storeId).Trim()
$pollMs = if ($config.pollMs) { [int]$config.pollMs } else { 1500 }
$labelGapMs = if ($config.labelGapMs) { [int]$config.labelGapMs } else { 500 }
$encodingName = if ($config.encoding) { ([string]$config.encoding).Trim().ToLower() } else { 'gb18030' }

if (-not $apiBase) { throw 'agent.config.json 缺少 apiBase，例如 https://teahour.fullyu.cn/api' }
if ($token.Length -lt 16) { throw 'agent.config.json 的 token 太短：服务端要求 16 位以上，用 openssl rand -hex 24 生成' }
if (-not $printerName) { throw 'agent.config.json 缺少 printerName，填 Windows「设备和打印机」里显示的打印机名称' }

$headers = @{ 'x-print-agent-token' = $token }

# ---------------------------------------------------------------- 出纸通道
if (-not ('TeahourRawPrinter' -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class TeahourRawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOC_INFO_1
    {
        public string pDocName;
        public string pOutputFile;
        public string pDataType;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOC_INFO_1 di);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

    // 返回空串表示成功；否则是给吧台看的中文失败原因。
    public static string Send(string printerName, byte[] data)
    {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            return "打开打印机失败：" + printerName + "（Win32 " + Marshal.GetLastWin32Error() + "）";
        try
        {
            DOC_INFO_1 di = new DOC_INFO_1();
            di.pDocName = "Teahour Cup Label";
            di.pDataType = "RAW";
            if (!StartDocPrinter(hPrinter, 1, di))
                return "StartDocPrinter 失败（Win32 " + Marshal.GetLastWin32Error() + "）";
            try
            {
                if (!StartPagePrinter(hPrinter))
                    return "StartPagePrinter 失败（Win32 " + Marshal.GetLastWin32Error() + "）";
                try
                {
                    int written;
                    if (!WritePrinter(hPrinter, data, data.Length, out written))
                        return "WritePrinter 失败（Win32 " + Marshal.GetLastWin32Error() + "）";
                    if (written != data.Length)
                        return "只写入 " + written + "/" + data.Length + " 字节";
                }
                finally { EndPagePrinter(hPrinter); }
            }
            finally { EndDocPrinter(hPrinter); }
        }
        finally { ClosePrinter(hPrinter); }
        return "";
    }
}
"@
}

function ConvertTo-PrinterBytes {
  param([string]$Text)
  if ($encodingName -eq 'utf8') { return [System.Text.Encoding]::UTF8.GetBytes($Text) }
  try {
    # 54936 = GB18030：TSS24.BF2 点阵字体按 GB 码解释，直接发 UTF-8 会印成乱码。
    return [System.Text.Encoding]::GetEncoding(54936).GetBytes($Text)
  } catch {
    throw "当前系统不支持 GB18030 编码，请把 agent.config.json 的 encoding 改成 utf8 或换一台系统重装过的电脑（$($_.Exception.Message)）"
  }
}

function Send-Label {
  param([string]$Tspl, [string]$What)
  $bytes = ConvertTo-PrinterBytes -Text $Tspl
  $errorText = [TeahourRawPrinter]::Send($printerName, $bytes)
  if ($errorText) { throw "$What：$errorText" }
}

# ---------------------------------------------------------------- 服务端接口
function Invoke-AgentApi {
  param([string]$Method, [string]$Path, $Body)
  $params = @{
    Method      = $Method
    Uri         = "$apiBase$Path"
    Headers     = $headers
    TimeoutSec      = 20
    ErrorAction     = 'Stop'
    # 5.1 默认走 IE 解析器，部分机器会报「Internet Explorer 引擎不可用」；PowerShell 7 里该参数是空操作。
    UseBasicParsing = $true
  }
  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Compress -Depth 5)
    $params.ContentType = 'application/json; charset=utf-8'
  }
  try {
    return Invoke-RestMethod @params
  } catch {
    $status = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($status -eq 401) { throw '令牌无效：检查 agent.config.json 的 token 是否与服务端 PRINT_AGENT_TOKENS 一致' }
    throw
  }
}

# ---------------------------------------------------------------- 自检
if ($Test) {
  Write-Log "自检开始：打印机 $printerName，编码 $encodingName"
  $selfTest = @"
SIZE 40 mm,60 mm
GAP 2 mm,0 mm
DIRECTION 1
DENSITY 8
SPEED 4
CLS
BAR 20,40,280,2
TEXT 20,60,"TSS24.BF2",0,1,1,"时叙自检 中文"
TEXT 20,90,"TSS24.BF2",0,1,1,"醒松庆眠 好不好"
TEXT 20,124,"5",0,1,1,"A001"
QRCODE 108,170,M,5,A,0,"A001-1"
TEXT 20,300,"TSS24.BF2",0,1,1,"左边距 2.5mm"
TEXT 20,330,"0",0,1,1,"0123456789 ABC"
PRINT 1,1
"@
  Send-Label -Tspl $selfTest -What '自检标签'
  Write-Log '自检标签已发送。请核对：①中文不是方块 ②二维码能扫出 A001-1 ③左边距约 2.5mm、字不糊'
  exit 0
}

# ---------------------------------------------------------------- 启动检查
try {
  $health = Invoke-AgentApi -Method GET -Path '/print-agent/health'
  if ($storeId -and $health.storeId -ne $storeId) {
    Write-Log "注意：令牌属于门店 $($health.storeId)，但配置写的是 $storeId；以令牌为准" 'WARN'
  }
  Write-Log "服务端连接正常，门店 $($health.storeId)"
} catch {
  Write-Log "连不上服务端：$($_.Exception.Message)" 'ERROR'
}

try {
  $found = Get-Printer -Name $printerName -ErrorAction Stop
  Write-Log "打印机就绪：$($found.Name)（$($found.DriverName)）"
} catch {
  Write-Log "系统里找不到打印机「$printerName」，请到「设备和打印机」核对名称，或先装好 XP-420B 驱动" 'ERROR'
}

# ---------------------------------------------------------------- 主循环
Write-Log "开始轮询：$apiBase（门店 $storeId，间隔 ${pollMs}ms）"
while ($true) {
  try {
    $resp = Invoke-AgentApi -Method POST -Path '/print-agent/claim'
    $job = $resp.job
    if ($null -eq $job) {
      if ($Once) { Write-Log '当前没有待打杯贴'; break }
      Start-Sleep -Milliseconds $pollMs
      continue
    }

    $labels = @($job.labels)
    Write-Log ("领取任务 {0}（{1} 张{2}）" -f $job.orderNumber, $labels.Count, $(if ($job.reprint) { '，补打' } else { '' }))

    $failure = $null
    foreach ($label in $labels) {
      try {
        Send-Label -Tspl ([string]$label.tspl) -What "杯贴 $($label.label)"
        Write-Log "已出纸 $($label.label)"
        if ($labels.Count -gt 1) { Start-Sleep -Milliseconds $labelGapMs }
      } catch {
        $failure = $_.Exception.Message
        break
      }
    }

    if ($failure) {
      Write-Log "回执失败：$failure" 'WARN'
      Invoke-AgentApi -Method POST -Path "/print-agent/jobs/$($job.jobId)/result" -Body @{ ok = $false; error = $failure } | Out-Null
    } else {
      Invoke-AgentApi -Method POST -Path "/print-agent/jobs/$($job.jobId)/result" -Body @{ ok = $true } | Out-Null
      Write-Log "回执成功 $($job.orderNumber)"
    }
  } catch {
    Write-Log "轮询异常：$($_.Exception.Message)" 'ERROR'
    Start-Sleep -Seconds 3
  }

  if ($Once) { break }
  Start-Sleep -Milliseconds $pollMs
}