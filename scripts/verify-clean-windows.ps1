param(
  [switch]$DisposableEnvironment,
  [switch]$GitHubHostedRunner,
  [string]$InputDirectory = 'C:\SpecwakeInput',
  [string]$OutputDirectory = 'C:\SpecwakeResults'
)
$ErrorActionPreference = 'Stop'
# This script installs/uninstalls software. It refuses the development host.
if (-not (($DisposableEnvironment -and $env:USERNAME -eq 'WDAGUtilityAccount') -or ($GitHubHostedRunner -and $env:GITHUB_ACTIONS -eq 'true' -and $env:RUNNER_ENVIRONMENT -eq 'github-hosted' -and $env:RUNNER_OS -eq 'Windows'))) {
  throw 'Run only inside the prepared disposable Windows Sandbox or explicit GitHub-hosted Windows runner. No installation attempted.'
}
$installPath = Join-Path $env:LOCALAPPDATA 'Specwake Clean QA'
if (Test-Path -LiteralPath $installPath) { throw 'A fresh Sandbox is required; installation target already exists.' }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$report = @{ status = 'failed'; at = [DateTime]::UtcNow.ToString('o'); checks = @() }
function Record([string]$check) { $report.checks += $check }
function Sha256([string]$file) {
  $sha = [Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($file)
  try { [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
  finally { $stream.Dispose(); $sha.Dispose() }
}
function RunOwned([string]$file, [string]$arguments, [int]$timeout = 120000) {
  $owned = Start-Process -FilePath $file -ArgumentList $arguments -WindowStyle Hidden -PassThru
  if (-not $owned.WaitForExit($timeout)) { Stop-Process -Id $owned.Id; throw 'Owned QA process timed out.' }
  $owned.Refresh()
  if ($owned.ExitCode -ne 0) { throw 'Owned QA process failed.' }
}
try {
  if (Get-Command node.exe,npm.cmd -ErrorAction SilentlyContinue) { throw 'Clean test requires no installed Node/npm.' }
  Record 'no Node.js or npm on clean Windows PATH'
  $setup = @(Get-ChildItem -LiteralPath $InputDirectory -Filter '*-Setup-x64.exe' -File)
  $portable = @(Get-ChildItem -LiteralPath $InputDirectory -Filter '*-Portable-x64.exe' -File)
  if ($setup.Count -ne 1 -or $portable.Count -ne 1) { throw 'Expected exactly one setup and one portable package.' }
  if($setup[0].Name -notmatch '^Specwake-(?<version>[0-9]+\.[0-9]+\.[0-9]+)-Setup-x64\.exe$'){throw 'Unexpected setup version name.'}
  $version=$Matches.version
  if($portable[0].Name -ne "Specwake-$version-Portable-x64.exe"){throw 'Portable/setup versions differ.'}
  $checksums = Get-Content -LiteralPath (Join-Path $InputDirectory "SHA256SUMS-$version.txt")
  foreach ($file in @($setup[0], $portable[0])) {
    $entry = @($checksums | Where-Object { $_ -match ('\s+' + [regex]::Escape($file.Name) + '$') })
    if ($entry.Count -ne 1 -or ($entry[0] -split '\s+')[0] -ne (Sha256 $file.FullName)) { throw 'Package checksum mismatch.' }
  }
  Record 'both delivered package hashes match'
  & (Join-Path $PSScriptRoot 'verify-desktop.ps1') -Executable $portable[0].FullName -EvidenceDirectory (Join-Path $OutputDirectory 'portable')
  Record 'portable management panel, separate bundled SDK client, stop and restart persistence'
  & (Join-Path $PSScriptRoot 'verify-upstream-desktop.ps1') -Executable $portable[0].FullName -EvidenceDirectory (Join-Path $OutputDirectory 'portable-upstream')
  Record 'portable real generic upstream, stable JSON, app reopen and fixed-port conflicts'
  $uninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
  $existing = @(Get-ChildItem $uninstallRoot -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object { $_.DisplayName -like 'Specwake*' })
  if ($existing.Count) { throw 'Fresh Sandbox must not contain an existing Specwake install.' }
  # NSIS /D is deliberately last, without quotes, including the space in this path.
  RunOwned $setup[0].FullName ('/S /D=' + $installPath)
  $installedExe = Join-Path $installPath 'Specwake.exe'
  if (-not (Test-Path -LiteralPath $installedExe)) { throw 'Installer did not create the expected executable.' }
  Record 'per-user silent installation into a path containing spaces'
  $registered = @(Get-ChildItem $uninstallRoot -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object { $_.DisplayName -like 'Specwake*' })
  if($registered.Count -ne 1 -or $registered[0].DisplayVersion -notlike "$version*"){throw 'Installed application version/registration differs from the tested package.'}
  Record 'installed version and uninstall registration match the candidate'
  & (Join-Path $PSScriptRoot 'verify-desktop.ps1') -Executable $installedExe -EvidenceDirectory (Join-Path $OutputDirectory 'installed')
  Record 'installed management panel, separate bundled SDK client, stop and restart persistence'
  & (Join-Path $PSScriptRoot 'verify-upstream-desktop.ps1') -Executable $installedExe -EvidenceDirectory (Join-Path $OutputDirectory 'installed-upstream')
  Record 'installed real generic upstream, stable JSON, app reopen and fixed-port conflicts'
  $links = @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Specwake.lnk'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Specwake.lnk'))
  if (-not ($links | Where-Object { Test-Path -LiteralPath $_ })) { throw 'Installer did not create an expected shortcut.' }
  Record 'installed shortcut exists'
  $uninstaller = @(Get-ChildItem -LiteralPath $installPath -Filter '*Uninstall*.exe' -File)
  if ($uninstaller.Count -ne 1) { throw 'Expected the installed package uninstaller.' }
  RunOwned $uninstaller[0].FullName ('/S _?=' + $installPath)
  if (Test-Path -LiteralPath $installedExe) { throw 'Uninstall left the application executable.' }
  if ($links | Where-Object { Test-Path -LiteralPath $_ }) { throw 'Uninstall left an installed shortcut.' }
  $remaining = @(Get-ChildItem $uninstallRoot -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object { $_.DisplayName -like 'Specwake*' })
  if ($remaining.Count) { throw 'Uninstall left application registration.' }
  Record 'uninstall removes executable, shortcuts and uninstall registration'
  $report.status = 'passed'
} catch {
  $report.error = $_.Exception.Message
  throw
} finally {
  $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'clean-windows-verification.json') -Encoding UTF8
}
