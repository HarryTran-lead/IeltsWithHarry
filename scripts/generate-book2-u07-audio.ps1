# Rebuild the four Unit 7 practice recordings from their authored transcripts.
Add-Type -AssemblyName System.Speech
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$lessonDir = Join-Path $root 'public/book-2/lessons'
$outputDir = Join-Path $root 'public/book-2/media/U07/audio'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

foreach ($slug in @('b2-u07-l-l07', 'b2-u07-l-l08', 'b2-u07-l-l09')) {
  $lesson = Get-Content -LiteralPath (Join-Path $lessonDir "$slug.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($recording in $lesson.audios) {
    $path = Join-Path $outputDir "$($recording.id).wav"
    $synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
    try {
      $synth.Rate = -1
      $synth.SetOutputToWaveFile($path)
      foreach ($line in ($recording.transcript -split "`n")) {
        if ($line.StartsWith('Student:')) { $synth.SelectVoice('Microsoft Zira Desktop') }
        else { $synth.SelectVoice('Microsoft David Desktop') }
        $synth.Speak($line)
      }
      $synth.SetOutputToNull()
    } finally {
      $synth.Dispose()
    }
    Write-Output $path
  }
}
