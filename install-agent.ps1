# RMM Agent Setup Script for Windows
# This script automates the installation and setup of the RMM Agent on Windows
# Usage: .\install-agent.ps1 -ServerUrl "ws://SERVER-IP:3000/ws" [options]

param(
    [Parameter(Mandatory=$true)]
    [string]$ServerUrl,
    
    [string]$InstallDir = "C:\Program Files\RMM-Agent",
    
    [switch]$Service,
    
    [int]$MetricsInterval = 60000,
    
    [int]$HeartbeatInterval = 30000
)

# Colors for output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Cyan = "Cyan"

function Write-Status($message) {
    Write-Host "[INFO] $message" -ForegroundColor $Cyan
}

function Write-Success($message) {
    Write-Host "[SUCCESS] $message" -ForegroundColor $Green
}

function Write-Error($message) {
    Write-Host "[ERROR] $message" -ForegroundColor $Red
}

function Write-Warning($message) {
    Write-Host "[WARNING] $message" -ForegroundColor $Yellow
}

function Test-Command($command) {
    return [bool](Get-Command -Name $command -ErrorAction SilentlyContinue)
}

function Install-NodeJS {
    Write-Status "Installing Node.js..."
    
    # Download and install Node.js
    $nodeUrl = "https://nodejs.org/dist/v18.19.0/node-v18.19.0-x64.msi"
    $installerPath = "$env:TEMP\nodejs-installer.msi"
    
    try {
        Invoke-WebRequest -Uri $nodeUrl -OutFile $installerPath
        Start-Process -FilePath "msiexec.exe" -ArgumentList "/i", $installerPath, "/quiet", "/norestart" -Wait
        Remove-Item $installerPath
        
        # Refresh environment variables
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        
        Write-Success "Node.js installed successfully"
    }
    catch {
        Write-Error "Failed to install Node.js: $_"
        exit 1
    }
}

function Test-Prerequisites {
    Write-Status "Checking prerequisites..."
    
    # Check if running as administrator
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
    if (-not $isAdmin) {
        Write-Warning "Not running as Administrator. Some features may not work."
    }
    
    # Check Node.js
    if (Test-Command "node") {
        $nodeVersion = & node --version
        Write-Success "Node.js $nodeVersion is installed"
        
        # Check version number
        $versionNum = $nodeVersion -replace 'v', '' -split '\.' | Select-Object -First 1
        if ([int]$versionNum -lt 16) {
            Write-Warning "Node.js version is too old. Installing newer version..."
            Install-NodeJS
        }
    }
    else {
        Write-Status "Node.js not found. Installing..."
        Install-NodeJS
    }
    
    # Check npm
    if (-not (Test-Command "npm")) {
        Write-Error "npm not found after Node.js installation"
        exit 1
    }
    
    # Check git
    if (-not (Test-Command "git")) {
        Write-Status "Installing Git..."
        $gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/Git-2.43.0-64-bit.exe"
        $gitInstaller = "$env:TEMP\git-installer.exe"
        
        try {
            Invoke-WebRequest -Uri $gitUrl -OutFile $gitInstaller
            Start-Process -FilePath $gitInstaller -ArgumentList "/VERYSILENT", "/NORESTART" -Wait
            Remove-Item $gitInstaller
            
            # Refresh environment
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            
            Write-Success "Git installed successfully"
        }
        catch {
            Write-Error "Failed to install Git: $_"
            exit 1
        }
    }
    
    Write-Success "Prerequisites check completed"
}

function Install-Agent {
    Write-Status "Setting up RMM Agent..."
    
    # Create installation directory
    if (Test-Path $InstallDir) {
        Write-Warning "Installation directory already exists: $InstallDir"
        $confirmation = Read-Host "Do you want to overwrite? (y/N)"
        if ($confirmation -ne 'y') {
            Write-Status "Installation cancelled"
            exit 0
        }
        Remove-Item -Path $InstallDir -Recurse -Force
    }
    
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Set-Location $InstallDir
    
    # Clone from GitHub
    Write-Status "Downloading RMM Agent..."
    try {
        & git clone --depth 1 https://github.com/nicthegarden/VC-RMM.git .
    }
    catch {
        Write-Error "Failed to clone repository: $_"
        exit 1
    }
    
    if (-not (Test-Path "client")) {
        Write-Error "Client directory not found after clone"
        exit 1
    }
    
    Set-Location client
    
    # Install dependencies
    Write-Status "Installing dependencies..."
    try {
        & npm install 2>&1 | Out-Null
    }
    catch {
        Write-Error "Failed to install dependencies: $_"
        exit 1
    }
    
    # Create data directory
    New-Item -ItemType Directory -Path "data" -Force | Out-Null
    
    # Update configuration
    Write-Status "Configuring agent..."
    $config = @{
        serverUrl = $ServerUrl
        heartbeatInterval = $HeartbeatInterval
        metricsInterval = $MetricsInterval
        logLevel = "info"
    } | ConvertTo-Json
    
    $config | Out-File -FilePath "config\agent.json" -Encoding UTF8
    
    Write-Success "Agent configured successfully"
    Write-Status "Server URL: $ServerUrl"
}

function Install-Service {
    Write-Status "Installing Windows service..."
    
    try {
        # Install node-windows
        & npm install node-windows 2>&1 | Out-Null
        
        # Create service
        $serviceScript = @"
const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
    name: 'RMM Agent',
    description: 'Remote Monitoring and Management Agent',
    script: path.join('$InstallDir', 'client', 'src', 'agent.js'),
    nodeOptions: ['--harmony', '--max_old_space_size=4096'],
    workingDirectory: path.join('$InstallDir', 'client')
});

svc.on('install', () => {
    console.log('Service installed successfully');
    svc.start();
});

svc.on('error', (err) => {
    console.error('Service error:', err);
});

svc.install();
"@
        
        $serviceScript | Out-File -FilePath "$InstallDir\client\install-svc.js" -Encoding UTF8
        
        # Run service installer
        Set-Location "$InstallDir\client"
        & node install-svc.js
        
        Write-Success "Service installed successfully"
        Write-Status "Service name: RMM Agent"
        Write-Status "Start: Start-Service 'RMM Agent'"
        Write-Status "Stop: Stop-Service 'RMM Agent'"
        Write-Status "Status: Get-Service 'RMM Agent'"
    }
    catch {
        Write-Error "Failed to install service: $_"
    }
}

function Test-Connection {
    Write-Status "Testing connection to server..."
    
    # Parse server URL
    $urlMatch = $ServerUrl -match 'wss?://([^:]+):(\d+)'
    if ($urlMatch) {
        $serverHost = $matches[1]
        $serverPort = $matches[2]
        
        try {
            $tcpClient = New-Object System.Net.Sockets.TcpClient
            $tcpClient.Connect($serverHost, [int]$serverPort)
            $tcpClient.Close()
            Write-Success "Connection test successful"
        }
        catch {
            Write-Warning "Cannot connect to server at ${serverHost}:${serverPort}"
            Write-Warning "Please check:"
            Write-Warning "  - Server is running"
            Write-Warning "  - Firewall allows connections on port $serverPort"
            Write-Warning "  - Server URL is correct: $ServerUrl"
        }
    }
}

function Show-Completion {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "RMM Agent Installation Complete!" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Installation Directory: $InstallDir"
    Write-Host "Server URL: $ServerUrl"
    
    $machineId = Get-Content "$InstallDir\client\data\machine.id" -ErrorAction SilentlyContinue
    if (-not $machineId) {
        $machineId = "Will be generated on first run"
    }
    Write-Host "Machine ID: $machineId"
    Write-Host ""
    
    if ($Service) {
        Write-Host "Service: RMM Agent"
        Write-Host "  Start:   Start-Service 'RMM Agent'"
        Write-Host "  Stop:    Stop-Service 'RMM Agent'"
        Write-Host "  Status:  Get-Service 'RMM Agent'"
        Write-Host ""
        Write-Host "To start the agent now, run:"
        Write-Host "  Start-Service 'RMM Agent'"
    }
    else {
        Write-Host "To start the agent manually, run:"
        Write-Host "  cd '$InstallDir\client'"
        Write-Host "  npm start"
    }
    
    Write-Host ""
    Write-Host "Next Steps:"
    Write-Host "  1. Verify the agent connects to the server"
    Write-Host "  2. Check the dashboard for the new machine"
    Write-Host "  3. Test remote commands and monitoring"
    Write-Host ""
    Write-Host "Configuration: $InstallDir\client\config\agent.json"
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
}

# Main execution
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "RMM Agent Setup for Windows" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Show configuration
Write-Status "Configuration:"
Write-Host "  Server URL: $ServerUrl"
Write-Host "  Install Directory: $InstallDir"
Write-Host "  Service: $Service"
Write-Host "  Metrics Interval: ${MetricsInterval}ms"
Write-Host "  Heartbeat Interval: ${HeartbeatInterval}ms"
Write-Host ""

$confirmation = Read-Host "Continue with installation? (Y/n)"
if ($confirmation -eq 'n') {
    Write-Status "Installation cancelled"
    exit 0
}

# Run installation steps
Test-Prerequisites
Install-Agent
Test-Connection

# Install service if requested
if ($Service) {
    Install-Service
}

# Show completion message
Show-Completion
