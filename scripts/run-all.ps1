# AgentID Full Stack Automation Script
# Starts Firebase emulators (via npx), seeds demo data, and launches frontend dev server
# Run with: powershell -ExecutionPolicy Bypass -File .\scripts\run-all.ps1

# Ensure we're in the project root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Join-Path $scriptDir '..'
Set-Location $projectRoot
Write-Host "Working directory: $projectRoot" -ForegroundColor Green

# Helper: run a command and capture its output for logging
function Invoke-AndLog {
    param(
        [string]$Description,
        [string]$Exe,
        [string[]]$Args
    )
    Write-Host "$Description..." -ForegroundColor Cyan
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Exe
    $psi.Arguments = ($Args -join ' ')
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
    $stderrTask = $proc.StandardError.ReadToEndAsync()
    $proc.WaitForExit()
    $stdout = $stdoutTask.Result
    $stderr = $stderrTask.Result
    if ($proc.ExitCode -ne 0) {
        Write-Error "$Description failed (exit code $($proc.ExitCode)):"
        Write-Host $stderr -ForegroundColor Red
        return @{ success = $false; stdout = $stdout; stderr = $stderr; exitCode = $proc.ExitCode }
    } else {
        Write-Host "$Description completed." -ForegroundColor Green
        return @{ success = $true; stdout = $stdout; stderr = $stderr; exitCode = $proc.ExitCode }
    }
}

# Function to start Firebase emulators (via npx) and wait for readiness
function Start-FirebaseEmulators {
    Write-Host "Starting Firebase emulators (functions & firestore) via npx..." -ForegroundColor Cyan

    # Start emulators in a background process using npx
    $emuProcess = Start-Process -FilePath 'npx' `
        -ArgumentList 'firebase','emulators:start','--only','functions,firestore' `
        -RedirectStandardOutput 'emu-out.log' -RedirectStandardError 'emu-err.log' `
        -PassThru -WindowStyle Hidden

    if (-not $emuProcess) {
        Write-Error "Failed to start Firebase emulators. Is npx/firebase available?"
        exit 1
    }

    Write-Host "Firebase emulators started (PID: $($emuProcess.Id)). Waiting for readiness..." -ForegroundColor Yellow

    # Wait for the emulator UI (hub) to be ready
    $maxAttempts = 30
    $attempt = 0
    $ready = $false

    while ($attempt -lt $maxAttempts -and -not $ready) {
        Start-Sleep -Seconds 2
        $attempt++
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:4400' -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                $ready = $true
                Write-Host "Firebase emulators are ready!" -ForegroundColor Green
            }
        } catch {
            Write-Host "Waiting for emulators... (attempt $attempt/$maxAttempts)" -ForegroundColor DarkGray
        }
    }

    if (-not $ready) {
        Write-Warning "Timed out waiting for emulator readiness. Continuing anyway..."
        if (Test-Path 'emu-err.log') {
            Get-Content 'emu-err.log' -Tail 10 | Write-Host -ForegroundColor Red
        }
    } else {
        Write-Host "Emulator URLs:" -ForegroundColor Cyan
        Write-Host "  Functions: http://127.0.0.1:5001" -ForegroundColor White
        Write-Host "  Firestore: http://127.0.0.1:8080" -ForegroundColor White
        Write-Host "  Emulator UI: http://127.0.0.1:4000/" -ForegroundColor White
    }

    return $emuProcess
}

# Function to run the seeder
function Run-Seeder {
    Write-Host "`nSeeding demo data..." -ForegroundColor Cyan

    # Ensure Firestore emulator host is set
    $env:FIRESTORE_EMULATOR_HOST = "localhost:8080"

    # Run seed script
    & python seed.py

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Seed script failed with exit code $LASTEXITCODE"
        exit 1
    }

    Write-Host "Seeding completed successfully!" -ForegroundColor Green
}

# Function to start frontend dev server
function Start-Frontend {
    Write-Host "`nStarting frontend development server..." -ForegroundColor Cyan

    Set-Location (Join-Path $projectRoot 'frontend')

    # Install dependencies if node_modules missing
    if (-not (Test-Path (Join-Path $PSBase 'node_modules'))) {
        Write-Host "Installing frontend dependencies..." -ForegroundColor DarkGray
        & npm install | Out-Null
    }

    Write-Host "Frontend will be available at: http://localhost:5173" -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop all services and exit." -ForegroundColor Yellow
    & npm run dev
    # When npm run dev exits (Ctrl+C) we continue to cleanup
}

# Main execution
try {
    $emuProc = Start-FirebaseEmulators
    Run-Seeder
    Start-Frontend
} finally {
    if ($emuProc) {
        Write-Host "`nStopping Firebase emulators..." -ForegroundColor Yellow
        Stop-Process -Id $emuProc.Id -Force -ErrorAction SilentlyContinue
        Write-Host "Emulators stopped." -ForegroundColor Green
    }
}