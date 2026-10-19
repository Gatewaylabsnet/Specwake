$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$release = Join-Path $root 'release'
$lines = foreach ($name in @("Specwake-$version-Portable-x64.exe", "Specwake-$version-Setup-x64.exe")) {
  $file = Join-Path $release $name
  $sha = [Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($file)
  try { $digest = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
  finally { $stream.Dispose(); $sha.Dispose() }
  $info = Get-Item -LiteralPath $file
  if ($info.VersionInfo.ProductVersion -notlike "$version*") { throw 'Executable version does not match source version.' }
  $digest + '  ' + $name
}
$target = Join-Path $release "SHA256SUMS-$version.txt"
[IO.File]::WriteAllLines($target, [string[]]$lines, [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath (Join-Path $root 'docs\WINDOWS_QUICK_START.md') -Destination (Join-Path $release "Specwake-$version-Kullanim.md") -Force
Copy-Item -LiteralPath (Join-Path $root 'docs\REAL_UPSTREAM.md') -Destination (Join-Path $release "Specwake-$version-Yonetim.md") -Force
Copy-Item -LiteralPath (Join-Path $root 'docs\DEEPSEEK_CLIENT_PROMPT.md') -Destination (Join-Path $release "Specwake-$version-DeepSeek-Prompt.md") -Force
Write-Output $target
