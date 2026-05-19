$ErrorActionPreference = "Stop"
$HostName = "com.duongstark.xiangqi_bot"
$Key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
if (Test-Path $Key) {
  Remove-Item -Path $Key -Force
  Write-Host "Removed native host: $HostName"
} else {
  Write-Host "Native host not installed: $HostName"
}
