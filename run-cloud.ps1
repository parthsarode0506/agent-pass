# AgentOS Standalone Startup Script (Real Cloud Firestore)
# Run with: powershell -ExecutionPolicy Bypass -File .\run-cloud.ps1

$projectRoot = $PSScriptRoot
if (-not $projectRoot) {
    $projectRoot = Get-Location
}
Set-Location $projectRoot
Write-Host "Working directory: $projectRoot" -ForegroundColor Green

# 1. Clear any local Firestore emulator environment variables
# This guarantees that the Firebase Admin SDK connects directly to the real Cloud Firestore
$env:FIRESTORE_EMULATOR_HOST = $null
$env:GCLOUD_PROJECT = "rift-2ef56"
$env:GOOGLE_APPLICATION_CREDENTIALS = "$env:APPDATA\firebase\parthsarode05_gmail_com_application_default_credentials.json"

Write-Host "Emulator host variable cleared. Connecting directly to the live Cloud Firestore database." -ForegroundColor Yellow

# 2. Check if Python virtual environment exists
$pythonPath = ".\functions\venv\Scripts\python.exe"
if (-not (Test-Path $pythonPath)) {
    Write-Error "Python virtual environment not found at $pythonPath. Please run setup first."
    exit 1
}

# 3. Start FastAPI Backend standalone on port 8080
Write-Host "`nStarting FastAPI backend on port 8080..." -ForegroundColor Cyan
$backendProcess = Start-Process -FilePath $pythonPath `
    -ArgumentList "functions\main.py" `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput 'backend-out.log' -RedirectStandardError 'backend-err.log' `
    -PassThru -WindowStyle Hidden

if (-not $backendProcess) {
    Write-Error "Failed to start FastAPI backend."
    exit 1
}
Write-Host "FastAPI backend started (PID: $($backendProcess.Id)). Logs are in backend-out.log." -ForegroundColor Yellow

# Wait for FastAPI backend to be ready
$backendReady = $false
for ($i = 1; $i -le 10; $i++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/health' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $backendReady = $true
            Write-Host "FastAPI backend is ready!" -ForegroundColor Green
            break
        }
    } catch {
        Write-Host "Waiting for backend... (attempt $i/10)" -ForegroundColor DarkGray
    }
}

if (-not $backendReady) {
    Write-Warning "FastAPI backend did not respond to status check. Please check backend-err.log for traceback details."
}

# 4. Start Frontend
try {
    Write-Host "`nStarting frontend dev server..." -ForegroundColor Cyan
    Set-Location (Join-Path $projectRoot 'frontend')
    
    # Run dev server
    Write-Host "Frontend will be available at: http://localhost:5173" -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop all services and exit." -ForegroundColor Yellow
    & npm run dev
} finally {
    # Cleanup background processes on exit
    Write-Host "`nStopping background services..." -ForegroundColor Yellow
    if ($backendProcess) {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host "FastAPI backend stopped." -ForegroundColor Green
    }
}
