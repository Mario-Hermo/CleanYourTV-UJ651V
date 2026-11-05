param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$testExePath = [IO.Path]::GetFullPath($config.exe)
$profileArg = @($config.args | Where-Object { $_.StartsWith('--user-data-dir=') })
if ($profileArg.Count -ne 1) { throw 'Perfil de ensayo ambiguo' }
$testProfilePath = $profileArg[0].Substring('--user-data-dir='.Length)
$run = [IO.Path]::GetFullPath((Split-Path -Parent $ConfigPath))
if ([IO.Path]::GetFullPath($testProfilePath) -ne (Join-Path $run 'profile')) { throw 'Perfil fuera del ensayo' }
$testExeName = [IO.Path]::GetFileName($testExePath)
$owned = @(Get-CimInstance Win32_Process -Filter "Name = '$testExeName'" | Where-Object { $_.ExecutablePath -eq $testExePath -and $_.CommandLine.Contains($testProfilePath) })
foreach ($item in $owned) {
    $fresh = Get-CimInstance Win32_Process -Filter "ProcessId = $($item.ProcessId)"
    if ($null -eq $fresh) { continue } # It exited normally between observations.
    if ($fresh.ExecutablePath -ne $testExePath -or -not $fresh.CommandLine.Contains($testProfilePath) -or $fresh.CreationDate -ne $item.CreationDate) {
        # CIM can return a terminating object's incomplete metadata. Skip only
        # if a separate native process lookup confirms that PID is absent.
        if ($null -eq (Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue)) { continue }
        throw 'Test process identity changed'
    }
    try { Stop-Process -Id $fresh.ProcessId -ErrorAction Stop }
    catch {
        # Normal exit can also win the race after the second identity observation.
        $after = Get-CimInstance Win32_Process -Filter "ProcessId = $($fresh.ProcessId)"
        if ($null -ne $after) { throw }
    }
}
$remaining = @(Get-CimInstance Win32_Process -Filter "Name = '$testExeName'" | Where-Object { $_.ExecutablePath -eq $testExePath -and $_.CommandLine.Contains($testProfilePath) })
[pscustomobject]@{stoppedOwned=$owned.Count;remaining=$remaining.Count} | ConvertTo-Json -Compress
if ($remaining.Count) { exit 1 }
