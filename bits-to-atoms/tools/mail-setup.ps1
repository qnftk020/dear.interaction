# One-time mail setup for the dear.interaction daily record (Windows PowerShell 5.1, ASCII only).
# Run this yourself in a normal PowerShell window. It asks for the sender account, an app password and the
# recipients, and saves them to %USERPROFILE%\.dear-interaction\mail.xml. The password is encrypted with
# Windows DPAPI, so only this Windows user on this PC can read it. Nothing is written to the repository.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File mail-setup.ps1
#
# Gmail: turn on 2-step verification, then create an "app password" at https://myaccount.google.com/apppasswords
# and paste that 16-character value here (not your normal Google password).
param([string]$StateDir = (Join-Path $env:USERPROFILE '.dear-interaction'))

$DEFAULT_HOST = 'smtp.gmail.com'
$DEFAULT_PORT = 587

New-Item -ItemType Directory -Force $StateDir | Out-Null
$from = (Read-Host 'Sender address (the account that sends the mail)').Trim()
$to = (Read-Host 'Recipient addresses (comma separated; Enter = same as sender)').Trim()
if (-not $to) { $to = $from }
$smtpHost = (Read-Host "SMTP host (Enter = $DEFAULT_HOST)").Trim()
if (-not $smtpHost) { $smtpHost = $DEFAULT_HOST }
$portText = (Read-Host "SMTP port (Enter = $DEFAULT_PORT)").Trim()
$port = if ($portText) { [int]$portText } else { $DEFAULT_PORT }
$password = Read-Host 'App password (input is hidden)' -AsSecureString

if (-not $from -or $password.Length -eq 0) { throw 'Sender address and app password are required.' }

$config = [pscustomobject]@{
  From       = $from
  To         = @($to -split '\s*,\s*' | Where-Object { $_ })
  SmtpHost   = $smtpHost
  Port       = $port
  Credential = New-Object System.Management.Automation.PSCredential($from, $password)
}
$file = Join-Path $StateDir 'mail.xml'
$config | Export-Clixml -Path $file
Write-Output "Saved: $file"
Write-Output "Recipients: $($config.To -join ', ')"
Write-Output 'Send a test now with: powershell -NoProfile -ExecutionPolicy Bypass -File daily-mail.ps1 -Force'
