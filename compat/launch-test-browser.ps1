param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$quoted = @($config.args | ForEach-Object { '"' + $_.Replace('"','\"') + '"' })
$process = Start-Process -FilePath $config.exe -ArgumentList $quoted -WindowStyle Hidden -PassThru
[pscustomobject]@{pid=$process.Id;exe=$config.exe;startedUtc=$process.StartTime.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress
