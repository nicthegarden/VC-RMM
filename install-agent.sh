#!/bin/bash

# RMM Agent Setup Script
# This script automates the installation and setup of the RMM Agent
# Usage: ./install-agent.sh --server-url ws://SERVER-IP:3000/ws [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
SERVER_URL=""
INSTALL_DIR="/opt/rmm-agent"
RUN_AS_SERVICE=false
SERVICE_NAME="rmm-agent"
NODE_VERSION="16"
METRICS_INTERVAL="60000"
HEARTBEAT_INTERVAL="30000"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to detect OS
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f /etc/debian_version ]; then
            echo "debian"
        elif [ -f /etc/redhat-release ]; then
            echo "rhel"
        elif [ -f /etc/arch-release ]; then
            echo "arch"
        else
            echo "linux"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    else
        echo "unknown"
    fi
}

# Function to install Node.js
install_nodejs() {
    print_status "Installing Node.js ${NODE_VERSION}..."
    
    OS=$(detect_os)
    
    case $OS in
        debian)
            curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
            apt-get install -y nodejs
            ;;
        rhel)
            curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash -
            yum install -y nodejs
            ;;
        arch)
            pacman -S --noconfirm nodejs npm
            ;;
        macos)
            if command_exists brew; then
                brew install node@${NODE_VERSION}
            else
                print_error "Homebrew not found. Please install Homebrew first."
                exit 1
            fi
            ;;
        *)
            print_error "Unsupported operating system"
            exit 1
            ;;
    esac
    
    print_success "Node.js installed successfully"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Node.js
    if command_exists node; then
        NODE_CURRENT=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_CURRENT" -ge "$NODE_VERSION" ]; then
            print_success "Node.js $(node --version) is installed"
        else
            print_warning "Node.js version is too old. Required: ${NODE_VERSION}+"
            install_nodejs
        fi
    else
        print_status "Node.js not found. Installing..."
        install_nodejs
    fi
    
    # Check npm
    if ! command_exists npm; then
        print_error "npm not found. Please install npm."
        exit 1
    fi
    
    # Check git
    if ! command_exists git; then
        print_status "Installing git..."
        OS=$(detect_os)
        case $OS in
            debian) apt-get update && apt-get install -y git ;;
            rhel) yum install -y git ;;
            arch) pacman -S --noconfirm git ;;
            macos) brew install git ;;
        esac
    fi
    
    print_success "Prerequisites check completed"
}

# Function to download and setup agent
setup_agent() {
    print_status "Setting up RMM Agent..."
    
    # Create installation directory
    if [ -d "$INSTALL_DIR" ]; then
        print_warning "Installation directory already exists: $INSTALL_DIR"
        read -p "Do you want to overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_status "Installation cancelled"
            exit 0
        fi
        rm -rf "$INSTALL_DIR"
    fi
    
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    # Clone from GitHub
    print_status "Downloading RMM Agent..."
    git clone --depth 1 https://github.com/nicthegarden/VC-RMM.git .
    
    if [ ! -d "client" ]; then
        print_error "Client directory not found after clone"
        exit 1
    fi
    
    cd client
    
    # Install dependencies
    print_status "Installing dependencies..."
    npm install
    
    # Create data directory
    mkdir -p data
    
    # Update configuration
    print_status "Configuring agent..."
    cat > config/agent.json <<EOF
{
  "serverUrl": "${SERVER_URL}",
  "heartbeatInterval": ${HEARTBEAT_INTERVAL},
  "metricsInterval": ${METRICS_INTERVAL},
  "logLevel": "info"
}
EOF
    
    print_success "Agent configured successfully"
    print_status "Server URL: ${SERVER_URL}"
}

# Function to create systemd service
create_service() {
    print_status "Creating systemd service..."
    
    if [ "$EUID" -ne 0 ]; then
        print_error "Creating service requires root privileges. Run with sudo."
        return 1
    fi
    
    # Detect current user (the one who ran sudo)
    CURRENT_USER=${SUDO_USER:-$USER}
    CURRENT_GROUP=$(id -gn "$CURRENT_USER")
    
    cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=RMM Agent - Remote Monitoring and Management Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}/client
ExecStart=/usr/bin/node src/agent.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable ${SERVICE_NAME}
    
    print_success "Service created: ${SERVICE_NAME}"
    print_status "Start with: sudo systemctl start ${SERVICE_NAME}"
    print_status "Check status: sudo systemctl status ${SERVICE_NAME}"
    print_status "View logs: sudo journalctl -u ${SERVICE_NAME} -f"
}

# Function to test connection
test_connection() {
    print_status "Testing connection to server..."
    
    # Extract host and port from server URL
    SERVER_HOST=$(echo "$SERVER_URL" | sed -E 's/wss?:\/\/([^:]+):.*/\1/')
    SERVER_PORT=$(echo "$SERVER_URL" | sed -E 's/.*:([0-9]+).*/\1/')
    
    if command_exists nc; then
        if nc -zv "$SERVER_HOST" "$SERVER_PORT" 2>/dev/null; then
            print_success "Connection test successful"
        else
            print_warning "Cannot connect to server at ${SERVER_HOST}:${SERVER_PORT}"
            print_warning "Please check:"
            print_warning "  - Server is running"
            print_warning "  - Firewall allows connections on port ${SERVER_PORT}"
            print_warning "  - Server URL is correct: ${SERVER_URL}"
        fi
    else
        print_warning "nc command not found, skipping connection test"
    fi
}

# Function to display completion message
show_completion() {
    echo
    echo "=========================================="
    print_success "RMM Agent Installation Complete!"
    echo "=========================================="
    echo
    echo "Installation Directory: ${INSTALL_DIR}"
    echo "Server URL: ${SERVER_URL}"
    echo "Machine ID: $(cat ${INSTALL_DIR}/client/data/machine.id 2>/dev/null || echo 'Will be generated on first run')"
    echo
    
    if [ "$RUN_AS_SERVICE" = true ]; then
        echo "Service: ${SERVICE_NAME}"
        echo "  Start:   sudo systemctl start ${SERVICE_NAME}"
        echo "  Stop:    sudo systemctl stop ${SERVICE_NAME}"
        echo "  Status:  sudo systemctl status ${SERVICE_NAME}"
        echo "  Logs:    sudo journalctl -u ${SERVICE_NAME} -f"
        echo
        echo "To start the agent now, run:"
        echo "  sudo systemctl start ${SERVICE_NAME}"
    else
        echo "To start the agent manually, run:"
        echo "  cd ${INSTALL_DIR}/client && npm start"
    fi
    
    echo
    echo "Next Steps:"
    echo "  1. Verify the agent connects to the server"
    echo "  2. Check the dashboard for the new machine"
    echo "  3. Test remote commands and monitoring"
    echo
    echo "Configuration: ${INSTALL_DIR}/client/config/agent.json"
    echo
    echo "=========================================="
}

# Function to parse arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --server-url)
                SERVER_URL="$2"
                shift 2
                ;;
            --install-dir)
                INSTALL_DIR="$2"
                shift 2
                ;;
            --service)
                RUN_AS_SERVICE=true
                shift
                ;;
            --metrics-interval)
                METRICS_INTERVAL="$2"
                shift 2
                ;;
            --heartbeat-interval)
                HEARTBEAT_INTERVAL="$2"
                shift 2
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Validate required arguments
    if [ -z "$SERVER_URL" ]; then
        print_error "Server URL is required!"
        echo
        show_help
        exit 1
    fi
    
    # Validate server URL format
    if [[ ! "$SERVER_URL" =~ ^wss?:\/\/ ]]; then
        print_error "Invalid server URL format. Must start with ws:// or wss://"
        echo "Example: ws://192.168.1.100:3000/ws"
        exit 1
    fi
}

# Function to show help
show_help() {
    cat <<EOF
RMM Agent Setup Script

Usage: ./install-agent.sh --server-url URL [OPTIONS]

Required:
    --server-url URL    WebSocket URL of the RMM server
                        Example: ws://192.168.1.100:3000/ws

Options:
    --install-dir PATH  Installation directory (default: /opt/rmm-agent)
    --service           Install as systemd service
    --metrics-interval  Metrics collection interval in ms (default: 60000)
    --heartbeat-interval Heartbeat interval in ms (default: 30000)
    --help              Show this help message

Examples:
    # Basic installation
    ./install-agent.sh --server-url ws://192.168.1.100:3000/ws

    # With service
    ./install-agent.sh --server-url ws://192.168.1.100:3000/ws --service

    # Custom intervals
    ./install-agent.sh --server-url ws://192.168.1.100:3000/ws \
                       --metrics-interval 30000 \
                       --service

EOF
}

# Main function
main() {
    echo "=========================================="
    echo "RMM Agent Setup"
    echo "=========================================="
    echo
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Show configuration
    print_status "Configuration:"
    echo "  Server URL: ${SERVER_URL}"
    echo "  Install Directory: ${INSTALL_DIR}"
    echo "  Service: ${RUN_AS_SERVICE}"
    echo "  Metrics Interval: ${METRICS_INTERVAL}ms"
    echo "  Heartbeat Interval: ${HEARTBEAT_INTERVAL}ms"
    echo
    
    read -p "Continue with installation? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]] && [ ! -z "$REPLY" ]; then
        print_status "Installation cancelled"
        exit 0
    fi
    
    # Run installation steps
    check_prerequisites
    setup_agent
    test_connection
    
    # Create service if requested
    if [ "$RUN_AS_SERVICE" = true ]; then
        create_service
    fi
    
    # Show completion message
    show_completion
}

# Run main function
main "$@"
