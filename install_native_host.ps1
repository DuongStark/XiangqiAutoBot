param(
  [Parameter(Mandatory=$true)]
  [string]$ExtensionId
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$HostName = "com.duongstark.xiangqi_bot"
$ManifestPath = Join-Path $Root "native_host_manifest.json"
$HostPath = Join-Path $Root "native_host.cmd"

$manifest = [ordered]@{
  name = $HostName
  description = "Xiangqi Bot Helper native host"
  path = $HostPath
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8

$Key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
New-Item -Path $Key -Force | Out-Null
(Get-Item -Path $Key).SetValue("", $ManifestPath)

Write-Host "Installed native host: $HostName"
Write-Host "Manifest: $ManifestPath"
