# Sends one day's daily record by mail (Windows PowerShell 5.1, ASCII only).
# Needs the settings saved by mail-setup.ps1. Each date is sent once; use -Force to send again.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File daily-mail.ps1                  # today (Korea time)
#   powershell -NoProfile -ExecutionPolicy Bypass -File daily-mail.ps1 -Date 2026-11-13 -Force
param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$StateDir = (Join-Path $env:USERPROFILE '.dear-interaction'),
  [string]$Date = '',
  [switch]$Force
)

$KST = 'Korea Standard Time'
$SMTP_TIMEOUT_MS = 30000

if (-not $Date) { $Date = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), $KST).ToString('yyyy-MM-dd') }
if ($Date -notmatch '^\d{4}-\d{2}-\d{2}$') { throw "Date must be YYYY-MM-DD: $Date" }

$configFile = Join-Path $StateDir 'mail.xml'
if (-not (Test-Path $configFile)) { Write-Output "mail is not set up (run mail-setup.ps1): $configFile"; exit 2 }
$sentDir = Join-Path $StateDir 'sent'
$sentMark = Join-Path $sentDir "$Date.txt"
if ((Test-Path $sentMark) -and -not $Force) { Write-Output "already sent: $Date"; exit 0 }

$outDir = Join-Path $StateDir "mail\$Date"
Push-Location (Join-Path $Root 'bits-to-atoms\app')
node scripts/daily-mail.ts $Date $outDir
$rendered = $LASTEXITCODE
Pop-Location
if ($rendered -ne 0) { Write-Output "FAILED: could not render the mail for $Date"; exit 1 }

$utf8 = [System.Text.Encoding]::UTF8
$subject = [System.IO.File]::ReadAllText((Join-Path $outDir 'subject.txt'), $utf8)
$html = [System.IO.File]::ReadAllText((Join-Path $outDir 'body.html'), $utf8)
$text = [System.IO.File]::ReadAllText((Join-Path $outDir 'body.txt'), $utf8)
$config = Import-Clixml -Path $configFile

$message = New-Object System.Net.Mail.MailMessage
$client = New-Object System.Net.Mail.SmtpClient($config.SmtpHost, $config.Port)
try {
  $message.From = New-Object System.Net.Mail.MailAddress($config.From, 'dear.interaction', $utf8)
  foreach ($address in $config.To) { $message.To.Add($address) }
  $message.Subject = $subject
  $message.SubjectEncoding = $utf8
  $message.Body = $text
  $message.BodyEncoding = $utf8
  $message.AlternateViews.Add([System.Net.Mail.AlternateView]::CreateAlternateViewFromString($html, $utf8, 'text/html'))
  $client.EnableSsl = $true
  $client.Timeout = $SMTP_TIMEOUT_MS
  $client.Credentials = $config.Credential.GetNetworkCredential()
  $client.Send($message)
} catch {
  Write-Output "FAILED: mail not sent: $($_.Exception.Message)"
  exit 1
} finally {
  $message.Dispose()
  $client.Dispose()
}

New-Item -ItemType Directory -Force $sentDir | Out-Null
Set-Content -Path $sentMark -Value (Get-Date).ToString('s') -Encoding ascii
Write-Output "mail sent for $Date to $($config.To.Count) recipient(s)"
