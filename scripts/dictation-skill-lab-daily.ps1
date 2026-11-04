# Daily Skill Lab audio run for Windows Task Scheduler, scheduled after the Gemini daily quota resets
# (midnight Pacific time). It requests the next batches with Gemini TTS, splits and checks them with
# Whisper, then reports what is left. When no turns are left, it removes its own scheduled task.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dictation-skill-lab-daily.ps1 [-DryRun]
#
# Log: .cache\dictation-skill-lab\daily.log
param(
  [switch]$DryRun,
  [int]$MaxRequests = 95,
  [string]$Models = "gemini-3.8-flash-lite-tts",
  [string]$EnvFile = "",
  [string]$Node = "node",
  [string]$Python = "python",
  [string]$TaskName = "IeltsWithHarry Skill Lab audio",
  # A clean worktree used only for publishing. New clips and the manifest are committed there on top
  # of origin/main and pushed, which deploys them to production. Empty = do not publish.
  [string]$PublishRepo = ""
)

function Get-ReadyCount([string]$root) {
  $turns = (Get-Content (Join-Path $root "content\dictation-skill-lab\audio-manifest.json") -Raw -Encoding utf8 | ConvertFrom-Json).turns
  $voiced = @{}; foreach ($name in $turns.PSObject.Properties.Name) { $voiced[$name] = $true }
  $count = 0
  foreach ($file in Get-ChildItem (Join-Path $root "content\dictation-skill-lab\lessons") -Filter *.json) {
    $lesson = Get-Content $file.FullName -Raw -Encoding utf8 | ConvertFrom-Json
    if (@($lesson.turns | Where-Object { -not $voiced["$($lesson.lesson_id)/$($_.turn_id)"] }).Count -eq 0) { $count += 1 }
  }
  return $count
}

function Publish-Audio([string]$source, [string]$target) {
  $git = { param([string]$arguments) Invoke-Logged "git -C `"$target`" $arguments" }
  $dirty = & cmd /c "git -C `"$target`" status --porcelain 2>&1"
  if ($dirty) { Write-Log "publish skipped: $target has uncommitted changes"; return }
  if ((& $git "fetch origin main") -ne 0) { Write-Log "publish skipped: fetch failed"; return }
  if ((& $git "checkout --detach origin/main") -ne 0) { Write-Log "publish skipped: checkout failed"; return }
  if (-not (Test-Path (Join-Path $target "src\lib\dictation-skill-lab\lessons.ts"))) { Write-Log "publish skipped: Skill Lab code is not on main"; return }
  cmd /c "robocopy `"$source\public\dictation-skill-lab\audio`" `"$target\public\dictation-skill-lab\audio`" /E /NFL /NDL /NJH /NJS /NP >> `"$log`" 2>&1" | Out-Null
  Copy-Item (Join-Path $source "content\dictation-skill-lab\audio-manifest.json") (Join-Path $target "content\dictation-skill-lab\audio-manifest.json") -Force
  & $git "add public/dictation-skill-lab/audio content/dictation-skill-lab/audio-manifest.json" | Out-Null
  & cmd /c "git -C `"$target`" diff --cached --quiet"
  if ($LASTEXITCODE -eq 0) { Write-Log "publish: no new audio"; return }
  $ready = Get-ReadyCount $target
  $message = Join-Path $cache "commit-message.txt"
  # Windows PowerShell's utf8 encoding adds a byte-order mark, which would end up in the commit subject.
  [System.IO.File]::WriteAllText($message, "Add Skill Lab dictation audio ($ready of 300 lessons ready)`n`nGenerated with Gemini TTS and split and checked with Whisper by scripts/dictation-skill-lab-daily.ps1.`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`n", (New-Object System.Text.UTF8Encoding $false))
  if ((& $git "commit -q -F `"$message`"") -ne 0) { Write-Log "publish failed: commit"; return }
  if ((& $git "push origin HEAD:main") -ne 0) {
    Write-Log "push rejected; rebasing on the latest main once"
    if ((& $git "pull --rebase origin main") -ne 0 -or (& $git "push origin HEAD:main") -ne 0) { & $git "rebase --abort" | Out-Null; Write-Log "publish failed: push"; return }
  }
  Write-Log "published audio to main ($ready lessons ready)"
}

$repo = Split-Path -Parent $PSScriptRoot
if (-not $EnvFile) { $EnvFile = Join-Path $repo ".env.local" }
$cache = Join-Path $repo ".cache\dictation-skill-lab"
New-Item -ItemType Directory -Force $cache | Out-Null
$log = Join-Path $cache "daily.log"
$lock = Join-Path $cache "daily.lock"

function Write-Log([string]$text) { Add-Content -Path $log -Encoding utf8 -Value ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $text) }
# cmd.exe redirection keeps native stderr out of PowerShell error records.
function Invoke-Logged([string]$command) { cmd /c "$command >> `"$log`" 2>&1"; return $LASTEXITCODE }

if (Test-Path $lock) {
  $owner = Get-Content $lock -ErrorAction SilentlyContinue
  if ($owner -and (Get-Process -Id $owner -ErrorAction SilentlyContinue)) { Write-Log "another run (PID $owner) is still working; skipping"; exit 0 }
}
Set-Content -Path $lock -Value $PID
Set-Location $repo
try {
  if (-not (Test-Path $EnvFile)) { Write-Log "env file not found: $EnvFile"; exit 1 }
  $tts = "`"$Node`" --env-file=`"$EnvFile`" --experimental-strip-types --no-warnings scripts/dictation-skill-lab-tts.mjs --models $Models --max-requests $MaxRequests --concurrency 2"
  if ($DryRun) {
    Write-Log "dry run"
    Invoke-Logged "$tts --dry-run" | Out-Null
    exit 0
  }
  Write-Log "TTS: up to $MaxRequests request(s) with $Models"
  Invoke-Logged $tts | Out-Null
  Write-Log "split and Whisper check"
  Invoke-Logged "`"$Python`" -X utf8 -u scripts/dictation-skill-lab-split.py --verify-existing" | Out-Null

  if ($PublishRepo) { Publish-Audio $repo $PublishRepo }

  $plan = & cmd /c "$tts --dry-run 2>&1"
  $left = 0
  foreach ($line in $plan) { if ($line -match "(\d+) turn\(s\) to voice") { $left = [int]$Matches[1] } }
  $unsplit = @(Get-ChildItem (Join-Path $cache "batches") -Filter *.json -ErrorAction SilentlyContinue | Where-Object { (Get-Content $_.FullName -Raw) -match '"split_at": null' }).Count
  Write-Log "left: $left turn(s) to voice, $unsplit unsplit batch(es)"
  if ($left -eq 0 -and $unsplit -eq 0) {
    Write-Log "all turns voiced; removing scheduled task '$TaskName'"
    try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop } catch { Write-Log "task not removed: $($_.Exception.Message)" }
  }
} finally {
  Remove-Item $lock -ErrorAction SilentlyContinue
}
