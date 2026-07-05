# Production deployment script for Travel Planner Chat
# Usage: .\deploy.ps1

$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$EnvFile = Join-Path $ProjectDir ".env"
$RequiredVars = @("OLLAMA_API_KEY", "MAPS_API_KEY")

if (-not (Test-Path $EnvFile)) {
    Write-Error "ERROR: $EnvFile not found. Copy .env.example and fill in your API keys:`n  cp .env.example .env"
    exit 1
}

# Validate required variables
$missing = $false
foreach ($var in $RequiredVars) {
    $pattern = "^${var}=[^\s]+"
    $match = Select-String -Path $EnvFile -Pattern $pattern -Quiet
    if (-not $match) {
        Write-Error "ERROR: $var is missing or empty in $EnvFile"
        $missing = $true
    }
}

if ($missing) {
    exit 1
}

Write-Host "Building and deploying Travel Planner Chat..."
Set-Location $ProjectDir

& docker compose down 2>$null
if ($LASTEXITCODE -ne 0) {
    # ignore errors from stopping non-running containers
}

& docker compose up --build -d
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker compose up failed"
    exit 1
}

Write-Host ""
Write-Host "Waiting for backend health check..."
$healthy = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost/api/health" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    } catch {
        # wait and retry
    }
    Start-Sleep -Seconds 2
}

if (-not $healthy) {
    Write-Error "WARNING: Backend health check timed out. Check logs with: docker compose logs backend"
    exit 1
}

Write-Host "Backend is healthy."
Write-Host ""
Write-Host "Deployment complete."
Write-Host "  App:       http://localhost"
Write-Host "  API:       http://localhost/api/health"
Write-Host ""
Write-Host "View logs:  docker compose logs -f"
Write-Host "Stop:       docker compose down"
