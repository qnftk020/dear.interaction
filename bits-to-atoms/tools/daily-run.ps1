# dear.interaction daily record runner (Windows PowerShell 5.1, ASCII only).
# Writes data/daily/<date>.yaml with Claude Code, validates it, then publishes main and gh-pages.
# Rules for the record itself live in ..\DAILY.md. The dashboard PIN is read from a file outside the repo.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File daily-run.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File daily-run.ps1 -Date 2026-11-12   # backfill one day
param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$Pages = (Join-Path (Split-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path -Parent) 'dear.interaction-pages'),
  [string]$StateDir = (Join-Path $env:USERPROFILE '.dear-interaction'),
  [string]$Date = ''
)

$KST = 'Korea Standard Time'
$TRAILER = 'Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>'
$ALLOWED_TOOLS = @('WebSearch', 'WebFetch', 'Read', 'Write', 'Edit', 'Glob', 'Grep')

if (-not $Date) { $Date = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), $KST).ToString('yyyy-MM-dd') }
if ($Date -notmatch '^\d{4}-\d{2}-\d{2}$') { throw "Date must be YYYY-MM-DD: $Date" }
$covers = ([datetime]::ParseExact($Date, 'yyyy-MM-dd', $null)).AddDays(-1).ToString('yyyy-MM-dd')

$app = Join-Path $Root 'bits-to-atoms\app'
$dailyRel = "bits-to-atoms/data/daily/$Date.yaml"
$dailyFile = Join-Path $Root "bits-to-atoms\data\daily\$Date.yaml"
$pinFile = Join-Path $StateDir 'pin.txt'
$logDir = Join-Path $StateDir 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "$Date.log") -Append | Out-Null

function Fail([string]$message) {
  Write-Output "FAILED: $message"
  Stop-Transcript | Out-Null
  exit 1
}
function Step([string]$label, [scriptblock]$action) {
  Write-Output "== $label"
  & $action
  if ($LASTEXITCODE -ne 0) { Fail "$label (exit $LASTEXITCODE)" }
}

Write-Output "daily record for $Date (covers $covers)"
if (-not (Test-Path $pinFile)) { Fail "PIN file not found: $pinFile" }
if (-not (Test-Path $Pages)) { Fail "gh-pages checkout not found: $Pages" }

Step 'update main' { git -C $Root pull --ff-only origin main }

if (Test-Path $dailyFile) {
  Write-Output "already written: $dailyRel"
} else {
  $prompt = @"
Follow bits-to-atoms/DAILY.md (it is written in Korean) and write today's daily record.
Upload date D = $Date, covered day D-1 = $covers (Korea time).
Search the web in Korean and English for entertech, immersive experience, interaction technology, robot interaction and virtual performer news from $covers, open the articles, pick 3, and write the file data/daily/$Date.yaml in Korean, in the same format as the existing files in data/daily.
Only write that one file. Do not run git, npm or any shell command; a script validates and publishes after you finish.
If you cannot find 3 stories from $covers (or the day before it), do not create the file and say why in one line.
"@
  Push-Location (Join-Path $Root 'bits-to-atoms')
  Step 'write the record with Claude Code' { claude -p $prompt --allowedTools $ALLOWED_TOOLS --disallowedTools 'Bash' 'PowerShell' }
  Pop-Location
  if (-not (Test-Path $dailyFile)) { Fail 'Claude did not create the daily file' }
}

Push-Location $app
Step 'validate' { npm run daily --silent }
Pop-Location

git -C $Root add $dailyRel
$staged = git -C $Root diff --cached --name-only
if ($staged) {
  Step 'commit main' { git -C $Root commit -q -m "docs: daily record $Date" -m $TRAILER }
  Step 'push main' { git -C $Root push -q origin main }
} else {
  Write-Output 'main already has this record'
}
$sha = git -C $Root rev-parse --short HEAD

Step 'update gh-pages checkout' { git -C $Pages fetch -q origin }
Step 'reset gh-pages checkout' { git -C $Pages checkout -q --detach origin/gh-pages }
$env:DASH_PIN = (Get-Content $pinFile -TotalCount 1).Trim()
$env:APP = $app
$env:OUT = $Pages
$env:COMMIT = $sha
Push-Location $Pages
Step 'rebuild snapshot' { node _tools/update.ts }
Pop-Location
Remove-Item Env:DASH_PIN

git -C $Pages add -A
Step 'commit gh-pages' { git -C $Pages commit -q -m "Daily record $Date" -m $TRAILER }
Step 'push gh-pages' { git -C $Pages push -q origin HEAD:gh-pages }

Write-Output "DONE: $Date published (main $sha)"
Stop-Transcript | Out-Null
