# Exports the corporate TLS-inspection root CA (public certificate) from the Windows trust store to
# .tools/corporate-ca.pem so container builds can verify registries behind the proxy.
# Usage: powershell -File scripts/export_corporate_ca.ps1 [-Subject Zscaler]
param([string]$Subject = 'Zscaler')

$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root '.tools\corporate-ca.pem'
$certs = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match [regex]::Escape($Subject) }
if (-not $certs) { throw "No root certificate matching '$Subject' in the Windows trust store." }

$pem = foreach ($c in $certs) {
  "-----BEGIN CERTIFICATE-----"
  [Convert]::ToBase64String($c.RawData, 'InsertLineBreaks')
  "-----END CERTIFICATE-----"
}
New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
[IO.File]::WriteAllText($dest, ($pem -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
"Wrote $dest ($(@($certs).Count) certificate(s))"
