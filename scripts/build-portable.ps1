# build-portable.ps1
# Genera dist\aura-learn-portable.zip — listo para distribuir sin instalar Node.
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\build-portable.ps1
#
# Requiere: Node 22 + npm instalados en el sistema (solo para el build).
# Produce:  dist\aura-learn-portable.zip  (~55 MB con node.exe incluido)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Configuracion ────────────────────────────────────────────────────────────
$NodeVersion = "v24.11.1"          # Node LTS; cambia si necesitas otra version
$NodeUrl     = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip"
$Root        = Split-Path $PSScriptRoot -Parent
$DistDir     = Join-Path $Root "dist\aura-learn-portable"
$ZipOut      = Join-Path $Root "dist\aura-learn-portable.zip"
$TmpNodeZip  = Join-Path $Root "dist\_node-tmp.zip"
# ─────────────────────────────────────────────────────────────────────────────

Push-Location $Root
Add-Type -AssemblyName System.IO.Compression.FileSystem

# 1. Limpiar y crear carpeta de salida
Write-Host "`n[1/5] Preparando carpeta de salida..."
if (Test-Path $DistDir) { Remove-Item $DistDir -Recurse -Force }
New-Item -ItemType Directory -Force $DistDir | Out-Null
New-Item -ItemType Directory -Force (Join-Path $Root "dist") | Out-Null

# 2. Copiar archivos de la app (excluye: legacy, data, .env*, scripts)
Write-Host "[2/5] Copiando archivos de la app..."

$folders = @("server", "public")
foreach ($f in $folders) {
    Copy-Item -Recurse (Join-Path $Root $f) (Join-Path $DistDir $f) -Force
}
Copy-Item (Join-Path $Root "package.json") (Join-Path $DistDir "package.json")
Copy-Item (Join-Path $Root "start.bat")    (Join-Path $DistDir "start.bat")

# Carpeta data vacia (la app la puebla en el primer arranque)
New-Item -ItemType Directory -Force (Join-Path $DistDir "data") | Out-Null

# NOTA: .env.local NO se copia — cada usuario configura sus propias API keys
#       desde la UI de Aura Learn (Ajustes → Servidores).

# 3. Instalar dependencias de produccion en la carpeta de distribucion
Write-Host "[3/5] Instalando dependencias de produccion..."
Push-Location $DistDir
& npm install --omit=dev --loglevel=warn
$npmExit = $LASTEXITCODE
Pop-Location
if ($npmExit -ne 0) { throw "npm install fallo." }

# 4. Descargar node.exe portable
$nodeExeDest = Join-Path $DistDir "node.exe"
if (Test-Path $nodeExeDest) {
    Write-Host "[4/5] node.exe ya existe, omitiendo descarga."
} else {
    Write-Host "[4/5] Descargando Node.js $NodeVersion (~30 MB)..."
    Invoke-WebRequest -Uri $NodeUrl -OutFile $TmpNodeZip -UseBasicParsing

    Write-Host "      Extrayendo node.exe..."
    $zip   = [System.IO.Compression.ZipFile]::OpenRead($TmpNodeZip)
    $entry = $zip.Entries | Where-Object { $_.Name -eq "node.exe" } | Select-Object -First 1
    if (-not $entry) { throw "node.exe no encontrado en el ZIP de Node.js." }

    $src = $entry.Open()
    $dst = [System.IO.File]::Create($nodeExeDest)
    $src.CopyTo($dst)
    $dst.Dispose(); $src.Dispose(); $zip.Dispose()
    Remove-Item $TmpNodeZip -Force
}

# 5. Empaquetar en ZIP
Write-Host "[5/5] Creando ZIP final..."
if (Test-Path $ZipOut) { Remove-Item $ZipOut -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($DistDir, $ZipOut)

$sizeMB = [math]::Round((Get-Item $ZipOut).Length / 1MB, 1)
Write-Host "`n Listo!  dist\aura-learn-portable.zip  ($sizeMB MB)"
Write-Host " Distribuye ese ZIP. El usuario descomprime y ejecuta start.bat.`n"

Pop-Location
