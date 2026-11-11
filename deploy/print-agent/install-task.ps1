#requires -version 5.1
<#
  注册「时叙杯贴打印代理」计划任务：开机（登录）自启、崩溃自动重启、隐藏窗口。
  以管理员身份运行一次即可；不需要时：
    Unregister-ScheduledTask -TaskName 'TeahourPrintAgent' -Confirm:$false
#>
[CmdletBinding()]
param([string]$TaskName = 'TeahourPrintAgent')

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'xprinter-agent.ps1'
if (-not (Test-Path $script)) { throw "找不到 $script" }
if (-not (Test-Path (Join-Path $PSScriptRoot 'agent.config.json'))) {
  throw '还没配置 agent.config.json：先复制 agent.config.example.json 并填好 token / printerName'
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $script) `
  -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "已注册并启动计划任务 $TaskName；日志见 $(Join-Path $PSScriptRoot 'agent.log')"
Write-Host '提示：打印机 USB 换口后会变成新设备，重新装一次驱动即可，令牌不用换。'