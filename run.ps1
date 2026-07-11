# AgentOS Execution Script
# Run with: powershell -ExecutionPolicy Bypass -File .\run.ps1

$projectRoot = $PSScriptRoot
if (-not $projectRoot) {
    $projectRoot = Get-Location
}
Set-Location $projectRoot
Write-Host "Working directory: $projectRoot" -ForegroundColor Green

# Set Java 21 environment variables for Firestore emulator compatibility
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot"
$env:Path = "C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot\bin;" + $env:Path

# Set Firestore Emulator environment variable globally for this process and children
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8082"
$env:GCLOUD_PROJECT = "agentid-hackathon"

# Locate npx
$npxPath = (Get-Command npx -ErrorAction SilentlyContinue).Source
if (-not $npxPath) {
    Write-Error "npx not found. Please install Node.js."
    exit 1
}

# 1. Start Firestore Emulator on port 8082
Write-Host "Starting Firestore emulator on port 8082..." -ForegroundColor Cyan
$emuProcess = Start-Process -FilePath "cmd.exe" `
    -ArgumentList '/c','npx','firebase','emulators:start','--only','firestore' `
    -RedirectStandardOutput 'firestore-emu-out.log' -RedirectStandardError 'firestore-emu-err.log' `
    -PassThru -WindowStyle Hidden

if (-not $emuProcess) {
    Write-Error "Failed to start Firestore emulator."
    exit 1
}
Write-Host "Firestore emulator started (PID: $($emuProcess.Id))." -ForegroundColor Yellow

# Wait for Firestore emulator to be ready
$ready = $false
for ($i = 1; $i -le 15; $i++) {
    Start-Sleep -Seconds 2
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8082' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        $ready = $true
    } catch {
        if ($_.Exception.Response -ne $null) {
            $ready = $true
        }
    }
    if ($ready) {
        Write-Host "Firestore emulator is ready!" -ForegroundColor Green
        break
    } else {
        Write-Host "Waiting for Firestore... (attempt $i/15)" -ForegroundColor DarkGray
    }
}

if (-not $ready) {
    Write-Warning "Firestore emulator may not have started properly. Proceeding anyway..."
}

# 2. Run Database Seeder
Write-Host "`nSeeding database..." -ForegroundColor Cyan
& ".\functions\venv\Scripts\python.exe" "seed.py"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Database seeding failed."
    Stop-Process -Id $emuProcess.Id -Force -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "Database seeded successfully!" -ForegroundColor Green

# 3. Start FastAPI Backend standalone on port 8080
Write-Host "`nStarting FastAPI backend on port 8080..." -ForegroundColor Cyan
$backendProcess = Start-Process -FilePath ".\functions\venv\Scripts\python.exe" `
    -ArgumentList "functions\main.py" `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput 'backend-out.log' -RedirectStandardError 'backend-err.log' `
    -PassThru -WindowStyle Hidden

if (-not $backendProcess) {
    Write-Error "Failed to start FastAPI backend."
    Stop-Process -Id $emuProcess.Id -Force -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "FastAPI backend started (PID: $($backendProcess.Id))." -ForegroundColor Yellow

# Wait for FastAPI backend to be ready
$backendReady = $false
for ($i = 1; $i -le 10; $i++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/tasks/types' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
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
    Write-Warning "FastAPI backend did not respond to status check. Standard output/error logs are in backend-out.log / backend-err.log."
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
    if ($emuProcess) {
        Stop-Process -Id $emuProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host "Firestore emulator stopped." -ForegroundColor Green
    }
}
