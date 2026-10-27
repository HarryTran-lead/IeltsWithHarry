# Copies authored curriculum and the published vocabulary library into a new dev project.
# No auth users, learner data, news archive or administrator records are copied.
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z]{20}$')][string]$TargetRef,
  [int]$BatchSize = 250,
  [switch]$Resume
)

$ErrorActionPreference = 'Stop'
$sourceRef = 'vpkhriywprepuhrbarye'
if ($TargetRef -eq $sourceRef) { throw 'The target must be a separate development project.' }
if ($BatchSize -lt 1 -or $BatchSize -gt 500) { throw 'BatchSize must be between 1 and 500.' }

function Query-Project([string]$projectRef, [string]$sql) {
  $errorFile = Join-Path $env:TEMP ('ielts-dev-query-' + [guid]::NewGuid().ToString('N') + '.log')
  $sqlFile = Join-Path $env:TEMP ('ielts-dev-query-' + [guid]::NewGuid().ToString('N') + '.sql')
  try {
    [System.IO.File]::WriteAllText($sqlFile, $sql, [System.Text.UTF8Encoding]::new($false))
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      $output = & npx --no-install supabase db query --linked --project-ref $projectRef --file $sqlFile --output json 2>$errorFile
      if ($LASTEXITCODE -eq 0) { break }
      $errorText = (Get-Content -LiteralPath $errorFile -Raw -ErrorAction SilentlyContinue) + ($output | Out-String)
      if ($attempt -lt 3 -and $errorText -match 'failed to connect as temp role|password authentication failed|timeout|connection reset') {
        Start-Sleep -Seconds (5 * $attempt)
        continue
      }
      $shortError = [regex]::Match($errorText, 'ERROR: [^\r\n]+').Value
      if (-not $shortError) { $shortError = $errorText.Substring(0, [Math]::Min(1200, $errorText.Length)) }
      throw "Database query failed for project $projectRef`: $shortError"
    }
  } finally {
    Remove-Item -LiteralPath $errorFile -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $sqlFile -ErrorAction SilentlyContinue
  }
  return ($output | Out-String | ConvertFrom-Json)
}

$projects = & npx --no-install supabase projects list --output json 2>$null | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Could not check Supabase projects.' }
$targetProject = $projects | Where-Object { $_.id -eq $TargetRef } | Select-Object -First 1
if ($targetProject.name -ne 'IeltsWithHarry-Development') { throw 'Target project name must be IeltsWithHarry-Development.' }
$userCount = (Query-Project $TargetRef 'select count(*)::int as total from auth.users;').rows[0].total
if ($userCount -ne 0) { throw 'Dev project has users. Refusing to replace its catalog.' }

$tables = @(
  @{ Name = 'courses'; Key = 'id' },
  @{ Name = 'units'; Key = 'id' },
  @{ Name = 'lessons'; Key = 'id' },
  @{ Name = 'lesson_materials'; Key = 'lesson_id' },
  @{ Name = 'lesson_blocks'; Key = 'id' },
  @{ Name = 'exercise_questions'; Key = 'id' },
  @{ Name = 'exercise_answer_keys'; Key = 'question_id' },
  @{ Name = 'vocabulary_entries'; Key = 'id' },
  @{ Name = 'vocabulary_bank_entries'; Key = 'source_id' }
)

# A new dev database contains only the starter seed at this point.
if (-not $Resume) {
  Query-Project $TargetRef 'truncate table public.courses cascade; truncate table public.vocabulary_bank_entries;' | Out-Null
}

foreach ($table in $tables) {
  $name = $table.Name
  $key = $table.Key
  $offset = 0
  if ($Resume) {
    $sourceCount = (Query-Project $sourceRef "select count(*)::int as total from public.$name;").rows[0].total
    $offset = (Query-Project $TargetRef "select count(*)::int as total from public.$name;").rows[0].total
    if ($offset -gt $sourceCount) { throw "$name has more rows in dev than production; cannot resume safely." }
    if ($offset -gt 0) {
      $sourceLast = (Query-Project $sourceRef "select $key as key_value from public.$name order by $key limit 1 offset $($offset - 1);").rows[0].key_value
      $targetLast = (Query-Project $TargetRef "select $key as key_value from public.$name order by $key desc limit 1;").rows[0].key_value
      if ($sourceLast -ne $targetLast) { throw "$name rows are not a matching prefix; cannot resume safely." }
    }
    if ($offset -eq $sourceCount) { Write-Output "$name`: already complete ($offset rows)"; continue }
  }
  do {
    $rows = (Query-Project $sourceRef "select to_jsonb(t) as data from public.$name t order by $key limit $BatchSize offset $offset;").rows
    if ($rows.Count -eq 0) { break }
    $json = ConvertTo-Json -InputObject @($rows | ForEach-Object { $_.data }) -Depth 100 -Compress
    $escaped = $json.Replace("'", "''")
    Query-Project $TargetRef "insert into public.$name select * from jsonb_populate_recordset(null::public.$name, '$escaped'::jsonb) on conflict do nothing;" | Out-Null
    $offset += $rows.Count
  } while ($rows.Count -eq $BatchSize)
  Write-Output "$name`: $offset rows copied"
}

Write-Output 'Dev catalog bootstrap complete; learner accounts and activity were not copied.'
