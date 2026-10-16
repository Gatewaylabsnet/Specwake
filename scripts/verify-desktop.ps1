param([string]$Executable = 'release\win-unpacked\Specwake.exe')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$exePath = (Resolve-Path -LiteralPath (Join-Path $projectRoot $Executable)).Path
$evidenceRoot = Join-Path $projectRoot 'artifacts'
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
$reportPath = Join-Path $evidenceRoot 'desktop-verification.json'
if (Test-Path -LiteralPath $reportPath) { Remove-Item -LiteralPath $reportPath }
$originalPath = $env:PATH
$originalRunAsNode = $env:ELECTRON_RUN_AS_NODE
try {
  # Prove that neither a globally installed Node.js nor the source checkout's cwd is needed.
  $env:PATH = "$env:SystemRoot\System32"
  $env:ELECTRON_RUN_AS_NODE = $null
  $process = Start-Process -FilePath $exePath -ArgumentList @('--self-test', ('"' + $reportPath + '"')) -WorkingDirectory $evidenceRoot -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(60000)) { Stop-Process -Id $process.Id; throw 'Desktop verification timed out.' }
  if (-not (Test-Path -LiteralPath $reportPath)) { throw 'Desktop application did not create its verification report.' }
  $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
  if (-not $report.passed) { throw 'Packaged desktop verification failed.' }
  $report | ConvertTo-Json -Depth 5
} finally {
  $env:PATH = $originalPath
  $env:ELECTRON_RUN_AS_NODE = $originalRunAsNode
}
