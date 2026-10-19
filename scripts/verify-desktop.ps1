param([string]$Executable = 'release\win-unpacked\Specwake.exe', [string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$candidate = if ([IO.Path]::IsPathRooted($Executable)) { $Executable } else { Join-Path $projectRoot $Executable }
$exePath = (Resolve-Path -LiteralPath $candidate).Path
$exeName = Split-Path -Leaf $exePath
if ($exeName -ne 'Specwake.exe' -and $exeName -notmatch '^Specwake-[0-9]+\.[0-9]+\.[0-9]+-Portable-x64\.exe$') {
  throw 'Only the unpacked Specwake app or its portable wrapper can be smoke-tested. Installer install/uninstall requires a separate disposable Windows VM.'
}
$evidenceRoot = if ($EvidenceDirectory) { [IO.Path]::GetFullPath($EvidenceDirectory) } else { Join-Path $projectRoot 'artifacts' }
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
$reportPath = Join-Path $evidenceRoot 'desktop-verification.json'
if (Test-Path -LiteralPath $reportPath) { Remove-Item -LiteralPath $reportPath }
$originalPath = $env:PATH
$originalRunAsNode = $env:ELECTRON_RUN_AS_NODE
try {
  # Prove that neither a globally installed Node.js nor the source checkout's cwd is needed.
  $env:PATH = "$env:SystemRoot\System32"
  $env:ELECTRON_RUN_AS_NODE = $null
  $firstReport = $null
  foreach ($attempt in 1,2) {
    $runReport = if ($attempt -eq 1) { Join-Path $evidenceRoot 'desktop-verification-first.json' } else { $reportPath }
    if (Test-Path -LiteralPath $runReport) { Remove-Item -LiteralPath $runReport }
    $process = Start-Process -FilePath $exePath -ArgumentList @('--self-test', ('"' + $runReport + '"')) -WorkingDirectory $evidenceRoot -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(60000)) { Stop-Process -Id $process.Id; throw 'Desktop verification timed out.' }
    $process.Refresh()
    if ($process.ExitCode -ne 0) { throw 'Desktop process exited unsuccessfully.' }
    if (-not (Test-Path -LiteralPath $runReport)) { throw 'Desktop application did not create its verification report.' }
    $report = Get-Content -LiteralPath $runReport -Raw | ConvertFrom-Json
    if (-not $report.passed -or -not $report.managementPanel -or -not $report.bundledIndependentClient) { throw 'Packaged management/client verification failed.' }
    foreach ($address in @($report.origin, $report.endpoint)) {
      $listening = Get-NetTCPConnection -State Listen -LocalPort ([Uri]$address).Port -ErrorAction SilentlyContinue
      if ($listening) { throw 'Desktop self-test left a listening service behind.' }
    }
    if (Test-Path -LiteralPath (Join-Path $evidenceRoot 'desktop-smoke-profile\demo-data\writer.lock')) { throw 'Desktop self-test left its journal lock.' }
    if ($firstReport) {
      if ($report.retainedBefore -ne $firstReport.retainedAfter) { throw 'Restart lost persisted call counts.' }
      foreach ($id in $firstReport.retainedIds) {
        if ($report.previousIds -notcontains $id) { throw 'Restart lost a recorded correlation ID.' }
      }
    } else { $firstReport = $report }
  }
  $report | Add-Member -NotePropertyName restartPersistenceVerified -NotePropertyValue $true -Force
  [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
  $report | ConvertTo-Json -Depth 5
} finally {
  $env:PATH = $originalPath
  $env:ELECTRON_RUN_AS_NODE = $originalRunAsNode
}
