# Quick Start Guide

Get RMM Server and Agent running in minutes with automated setup scripts!

## 🚀 One-Line Install (Linux/Mac)

### Server Installation

```bash
# Basic installation
curl -fsSL https://raw.githubusercontent.com/nicthegarden/VC-RMM/main/install-server.sh | bash

# With custom port and service
curl -fsSL https://raw.githubusercontent.com/nicthegarden/VC-RMM/main/install-server.sh | bash -s -- --port 8080 --service
```

### Agent Installation

```bash
# Replace SERVER_IP with your server's IP address
curl -fsSL https://raw.githubusercontent.com/nicthegarden/VC-RMM/main/install-agent.sh | bash -s -- --server-url ws://SERVER_IP:3000/ws --service
```

**Example with actual IP:**
```bash
curl -fsSL https://raw.githubusercontent.com/nicthegarden/VC-RMM/main/install-agent.sh | bash -s -- --server-url ws://192.168.1.100:3000/ws --service
```

## 🪟 Windows Installation

### Server (PowerShell as Administrator)

```powershell
# Coming soon - Manual installation for now
# Download and run install scripts manually
```

### Agent (PowerShell as Administrator)

```powershell
# Download the install script
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/nicthegarden/VC-RMM/main/install-agent.ps1" -OutFile "install-agent.ps1"

# Run with your server URL
.\install-agent.ps1 -ServerUrl "ws://SERVER_IP:3000/ws" -Service
```

**Example:**
```powershell
.\install-agent.ps1 -ServerUrl "ws://192.168.1.100:3000/ws" -Service
```

## 📋 Step-by-Step Setup

### 1. Server Setup (One Machine)

**Option A: Quick Install (Recommended)**
```bash
# Download and run the install script
curl -O https://raw.githubusercontent.com/nicthegarden/VC-RMM/main/install-server.sh
chmod +x install-server.sh
./install-server.sh --service
```

**Option B: Manual Installation**
```bash
# Clone repository
git clone https://github.com/nicthegarden/VC-RMM.git
cd VC-RMM/server

# Install dependencies
npm install

# Start server
npm start
```

### 2. Agent Setup (Each Client Machine)

**Option A: Quick Install (Recommended)**
```bash
# Replace with your server's IP
curl -O https://raw.githubusercontent.com/nicthegarden/VC-RMM/main/install-agent.sh
chmod +x install-agent.sh
./install-agent.sh --server-url ws://YOUR-SERVER-IP:3000/ws --service
```

**Option B: Manual Installation**
```bash
# Clone repository
git clone https://github.com/nicthegarden/VC-RMM.git
cd VC-RMM/client

# Configure
# Edit config/agent.json and set serverUrl

# Install dependencies
npm install

# Start agent
npm start
```

## ⚡ Automated Deployment for Multiple Machines

### Ansible Playbook (Example)

```yaml
# deploy-agents.yml
---
- name: Deploy RMM Agent
  hosts: all
  become: yes
  vars:
    rmm_server_url: "ws://192.168.1.100:3000/ws"
  
  tasks:
    - name: Install RMM Agent
      shell: |
        curl -fsSL https://raw.githubusercontent.com/nicthegarden/VC-RMM/main/install-agent.sh | \
        bash -s -- --server-url {{ rmm_server_url }} --service
      args:
        creates: /opt/rmm-agent
```

**Run:**
```bash
ansible-playbook -i inventory.ini deploy-agents.yml
```

### Docker Compose (Alternative)

```yaml
# docker-compose.yml
version: '3.8'

services:
  rmm-server:
    build: ./server
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    
  rmm-agent:
    build: ./client
    environment:
      - SERVER_URL=ws://rmm-server:3000/ws
    restart: unless-stopped
    depends_on:
      - rmm-server
```

## 🔧 Install Script Options

### Server Install Script

```bash
./install-server.sh [OPTIONS]

Options:
    --port PORT         Server port (default: 3000)
    --host HOST         Server bind address (default: 0.0.0.0)
    --install-dir PATH  Installation directory (default: /opt/rmm-server)
    --service           Install as systemd service
    --no-firewall       Skip firewall configuration
    --help              Show help

Examples:
    ./install-server.sh --port 8080 --service
    ./install-server.sh --host 192.168.1.100 --service
```

### Agent Install Script

```bash
./install-agent.sh --server-url URL [OPTIONS]

Required:
    --server-url URL    WebSocket URL of the RMM server

Options:
    --install-dir PATH  Installation directory (default: /opt/rmm-agent)
    --service           Install as systemd service
    --metrics-interval  Metrics collection interval in ms (default: 60000)
    --heartbeat-interval Heartbeat interval in ms (default: 30000)
    --help              Show help

Examples:
    ./install-agent.sh --server-url ws://192.168.1.100:3000/ws --service
    ./install-agent.sh --server-url ws://192.168.1.100:3000/ws --metrics-interval 30000
```

## 🎯 Minimal Setup (5 Minutes)

### On Server Machine:
```bash
curl -fsSL https://raw.githubusercontent.com/nicthegarden/VC-RMM/main/install-server.sh | bash -s -- --service
```

**Note the IP address shown at the end!**

### On Each Client Machine:
```bash
# Replace SERVER_IP with the IP from above
curl -fsSL https://raw.githubusercontent.com/nicthegarden/VC-RMM/main/install-agent.sh | bash -s -- --server-url ws://SERVER_IP:3000/ws --service
```

### Access Dashboard:
```
http://SERVER_IP:3000
```

## 📊 Bulk Agent Deployment

### Script for Deploying to Multiple Machines

Create `deploy-agents.sh`:

```bash
#!/bin/bash

SERVER_IP="192.168.1.100"
AGENT_INSTALL_URL="https://raw.githubusercontent.com/nicthegarden/VC-RMM/main/install-agent.sh"

# List of client machines (IP addresses or hostnames)
CLIENTS=(
    "192.168.1.101"
    "192.168.1.102"
    "192.168.1.103"
    # Add more...
)

# SSH user
SSH_USER="admin"

for client in "${CLIENTS[@]}"; do
    echo "Deploying to $client..."
    
    ssh "$SSH_USER@$client" "
        curl -fsSL $AGENT_INSTALL_URL | bash -s -- \
            --server-url ws://${SERVER_IP}:3000/ws \
            --service
    "
    
    if [ $? -eq 0 ]; then
        echo "✓ Successfully deployed to $client"
    else
        echo "✗ Failed to deploy to $client"
    fi
done

echo "Deployment complete!"
```

**Usage:**
```bash
chmod +x deploy-agents.sh
./deploy-agents.sh
```

## 🐳 Docker Quick Start

### Run Server with Docker

```bash
docker run -d \
  --name rmm-server \
  -p 3000:3000 \
  -v rmm-data:/app/data \
  --restart unless-stopped \
  ghcr.io/nicthegarden/vc-rmm:server-latest
```

### Run Agent with Docker

```bash
docker run -d \
  --name rmm-agent \
  -e SERVER_URL=ws://SERVER_IP:3000/ws \
  --restart unless-stopped \
  ghcr.io/nicthegarden/vc-rmm:agent-latest
```

## ✅ Post-Installation Checklist

- [ ] Server is running and accessible
- [ ] Dashboard loads at `http://SERVER_IP:3000`
- [ ] Agents are connecting (check online status)
- [ ] Test remote command execution
- [ ] Test file browser
- [ ] Verify metrics are being collected
- [ ] Configure firewall rules
- [ ] Set up monitoring alerts (optional)

## 🆘 Troubleshooting

### Server won't start
```bash
# Check logs
sudo journalctl -u rmm-server -f

# Check port availability
sudo lsof -i :3000

# Restart service
sudo systemctl restart rmm-server
```

### Agent won't connect
```bash
# Check agent logs
sudo journalctl -u rmm-agent -f

# Test server connectivity
nc -zv SERVER_IP 3000

# Check configuration
cat /opt/rmm-agent/client/config/agent.json
```

### Need to reconfigure
```bash
# Edit server config
sudo nano /opt/rmm-server/server/config/default.json
sudo systemctl restart rmm-server

# Edit agent config
sudo nano /opt/rmm-agent/client/config/agent.json
sudo systemctl restart rmm-agent
```

## 📚 Next Steps

1. Read the full [README.md](README.md) for detailed documentation
2. Check [CONFIGURATION.md](CONFIGURATION.md) for advanced settings
3. Review security recommendations before production use
4. Set up monitoring and alerting

## 🎓 Pro Tips

- **Use `--service` flag** for production deployments
- **Keep ports consistent** between server and agent configs
- **Test one agent first** before bulk deployment
- **Use a dedicated server** for the RMM (don't install agent on server)
- **Document your setup** - save the server IP and port

---

**Need help?** Check the [README](README.md) or open an issue on GitHub!
