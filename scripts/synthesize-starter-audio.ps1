param(
  [Parameter(Mandatory=$true)][string]$TextPath,
  [Parameter(Mandatory=$true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$speech = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $speech.SelectVoice('Microsoft Zira Desktop')
  $speech.Rate = -1
  $speech.SetOutputToWaveFile($OutputPath)
  $speech.Speak([System.IO.File]::ReadAllText($TextPath, [System.Text.Encoding]::UTF8))
} finally {
  $speech.Dispose()
}
