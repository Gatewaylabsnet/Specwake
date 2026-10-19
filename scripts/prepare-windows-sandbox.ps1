param([switch]$Launch)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$id = 'windows-clean-' + [Guid]::NewGuid().ToString('N').Substring(0,12)
$bundle = Join-Path $root ('.tmp\' + $id)
$inputFolder = Join-Path $bundle 'input'
$qaFolder = Join-Path $bundle 'qa'
$outputFolder = Join-Path $root ('artifacts\' + $id)
New-Item -ItemType Directory -Path $inputFolder,$qaFolder,$outputFolder | Out-Null
foreach ($name in @("Specwake-$version-Portable-x64.exe", "Specwake-$version-Setup-x64.exe", "SHA256SUMS-$version.txt")) {
  $source = Join-Path $root ('release\' + $name)
  if (-not (Test-Path -LiteralPath $source)) { throw 'Build the current setup, portable package and versioned checksums first.' }
  $destination = if ($name -like 'SHA256SUMS-*') { Join-Path $inputFolder 'SHA256SUMS.txt' } else { Join-Path $inputFolder $name }
  Copy-Item -LiteralPath $source -Destination $destination
}
foreach ($name in @('verify-desktop.ps1','verify-clean-windows.ps1')) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $qaFolder $name)
}
$escape = { param($value) [Security.SecurityElement]::Escape($value) }
$wsb = @"
<Configuration>
  <Networking>Disable</Networking>
  <VGpu>Disable</VGpu>
  <ClipboardRedirection>Disable</ClipboardRedirection>
  <MappedFolders>
    <MappedFolder><HostFolder>$(& $escape $inputFolder)</HostFolder><SandboxFolder>C:\SpecwakeInput</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
    <MappedFolder><HostFolder>$(& $escape $qaFolder)</HostFolder><SandboxFolder>C:\SpecwakeQA</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
    <MappedFolder><HostFolder>$(& $escape $outputFolder)</HostFolder><SandboxFolder>C:\SpecwakeResults</SandboxFolder><ReadOnly>false</ReadOnly></MappedFolder>
  </MappedFolders>
  <LogonCommand><Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\SpecwakeQA\verify-clean-windows.ps1 -DisposableEnvironment</Command></LogonCommand>
</Configuration>
"@
$config = Join-Path $outputFolder 'Specwake-Clean-Windows.wsb'
$wsb | Set-Content -LiteralPath $config -Encoding UTF8
$sandbox = Join-Path $env:SystemRoot 'System32\WindowsSandbox.exe'
$available = Test-Path -LiteralPath $sandbox
$report = @{ at = [DateTime]::UtcNow.ToString('o'); status = 'prepared-not-run'; sandboxAvailable = $available; configuration = $config; checks = @() }
$report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'artifacts\windows-clean-availability.json') -Encoding UTF8
Write-Output "Prepared: $config"
Write-Output 'Clean Windows installation/uninstallation has NOT run. No Windows features or security settings changed.'
if ($Launch) {
  if (-not $available) { throw 'Windows Sandbox is unavailable. Prepared files remain; no feature installation attempted.' }
  Start-Process -FilePath $sandbox -ArgumentList ('"' + $config + '"') -WindowStyle Hidden
}
