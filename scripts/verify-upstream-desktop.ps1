param([string]$Executable='release\win-unpacked\Specwake.exe',[string]$EvidenceDirectory)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$exePath=(Resolve-Path -LiteralPath $Executable).Path
if ((Split-Path -Leaf $exePath) -ne 'Specwake.exe' -and (Split-Path -Leaf $exePath) -notmatch '^Specwake-[0-9]+\.[0-9]+\.[0-9]+-Portable-x64\.exe$') { throw 'Use unpacked, installed or portable app; never execute the installer as an application.' }
$evidence=if($EvidenceDirectory){[IO.Path]::GetFullPath($EvidenceDirectory)}else{Join-Path $projectRoot ('artifacts\upstream-desktop-'+[guid]::NewGuid().ToString('N'))}
if(Test-Path -LiteralPath (Join-Path $evidence 'first.json')){throw 'Use a fresh disposable QA evidence folder.'}
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$control=Join-Path $evidence 'upstream-control'
New-Item -ItemType Directory -Path $control -Force | Out-Null
$priorQaPath=$env:PATH;$priorQaRunAsNode=$env:ELECTRON_RUN_AS_NODE
$backend=$null
try {
  $env:PATH="$env:SystemRoot\System32";$env:ELECTRON_RUN_AS_NODE=$null
  $backend=Start-Process -FilePath $exePath -ArgumentList @(('"--qa-upstream='+$control+'"')) -WorkingDirectory $evidence -WindowStyle Hidden -PassThru
  $upstreamFile=Join-Path $control 'upstream.json'
  foreach($i in 1..100){if(Test-Path -LiteralPath $upstreamFile){break};$backend.Refresh();if($backend.HasExited){throw 'QA upstream process exited.'};Start-Sleep -Milliseconds 200}
  if(-not(Test-Path -LiteralPath $upstreamFile)){throw 'QA upstream readiness timeout.'}
  $upstream=Get-Content -LiteralPath $upstreamFile -Raw | ConvertFrom-Json
  foreach($stage in @('first','reopen')){
    $contextFile=Join-Path $evidence 'context.json'
    [IO.File]::WriteAllText($contextFile,(@{baseUrl=$upstream.baseUrl;stage=$stage}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
    $reportFile=Join-Path $evidence ($stage+'.json')
    $appProcess=Start-Process -FilePath $exePath -ArgumentList @('--self-test',('"'+$reportFile+'"'),('"--accept-upstream='+$contextFile+'"')) -WorkingDirectory $evidence -WindowStyle Hidden -PassThru
    if(-not $appProcess.WaitForExit(90000)){Stop-Process -Id $appProcess.Id;throw 'Owned packaged upstream test timed out.'}
    $appProcess.Refresh();if($appProcess.ExitCode -ne 0){throw 'Packaged upstream acceptance exited unsuccessfully.'}
    $report=Get-Content -LiteralPath $reportFile -Raw|ConvertFrom-Json
    if(-not $report.passed -or -not $report.packaged){throw 'Packaged upstream report failed.'}
    if($stage -eq 'reopen' -and -not $report.reopenVerified){throw 'Reopen persistence was not verified.'}
    foreach($address in @($report.origin,$report.endpoint)){if(Get-NetTCPConnection -State Listen -LocalPort ([Uri]$address).Port -ErrorAction SilentlyContinue){throw 'Owned app left a listening port.'}}
  }
  $requests=Get-Content -LiteralPath (Join-Path $control 'requests.json') -Raw|ConvertFrom-Json
  if(@($requests|Where-Object {$_ -eq 'POST /query'}).Count -ne 6){throw 'Unexpected upstream POST count; possible validation or replay regression.'}
  if($requests|Where-Object {$_ -notin @('GET /health','POST /query')}){throw 'Unselected upstream route was contacted.'}
  [IO.File]::WriteAllText((Join-Path $evidence 'upstream-desktop-verification.json'),(@{passed=$true;format=(Split-Path -Leaf $exePath);stage='first + app reopen';oldJsonReused=$true;postRequests=6;noGlobalNodeNpmOnPath=$true}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
  Write-Output 'PASS packaged generic upstream / independent SDK / stable JSON / app reopen / safe credentials'
} finally {
  [IO.File]::WriteAllText((Join-Path $control 'stop'),'stop')
  if($backend){if(-not $backend.WaitForExit(10000)){Stop-Process -Id $backend.Id}}
  $env:PATH=$priorQaPath;$env:ELECTRON_RUN_AS_NODE=$priorQaRunAsNode
}
