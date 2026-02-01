# RMM Configuration Guide

This document describes all configuration options for the RMM Server and Agent.

## Table of Contents
1. [Server Configuration](#server-configuration)
2. [Agent Configuration](#agent-configuration)
3. [Linux Service Configuration](#linux-service-configuration)
4. [Windows Service Configuration](#windows-service-configuration)
5. [Environment Variables](#environment-variables)

---

## Server Configuration

### Config File: `server/config/default.json`

```json
{
  "port": 3000,
  "host": "0.0.0.0",
  "database": {
    "path": "./data/rmm.db"
  },
  "websocket": {
    "heartbeatInterval": 30000,
    "reconnectTimeout": 5000
  },
  "cleanup": {
    "oldCommandsHours": 24,
    "metricsRetentionDays": 30,
    "logsRetentionDays": 7
  },
  "security": {
    "corsEnabled": true,
    "rateLimitEnabled": false,
    "authEnabled": false
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | 3000 | Server port number |
| `host` | string | "0.0.0.0" | Server bind address (use "127.0.0.1" for localhost only) |
| `database.path` | string | "./data/rmm.db" | SQLite database file path |
| `websocket.heartbeatInterval` | number | 30000 | WebSocket heartbeat interval in milliseconds |
| `websocket.reconnectTimeout` | number | 5000 | WebSocket reconnection timeout in milliseconds |
| `cleanup.oldCommandsHours` | number | 24 | Hours after which to delete completed/failed commands |
| `cleanup.metricsRetentionDays` | number | 30 | Days to keep metrics history |
| `cleanup.logsRetentionDays` | number | 7 | Days to keep system logs |
| `security.corsEnabled` | boolean | true | Enable CORS for cross-origin requests |
| `security.rateLimitEnabled` | boolean | false | Enable API rate limiting |
| `security.authEnabled` | boolean | false | Enable authentication (requires implementation) |

### Important Server Settings

**For Production Use:**
1. Change `host` to your server's IP or domain
2. Set `security.authEnabled` to `true` (requires implementing authentication)
3. Enable HTTPS/WSS (configure reverse proxy like Nginx)
4. Adjust retention settings based on your storage capacity

**Example Production Config:**
```json
{
  "port": 3000,
  "host": "192.168.1.100",
  "security": {
    "corsEnabled": false,
    "rateLimitEnabled": true,
    "authEnabled": true
  }
}
```

---

## Agent Configuration

### Config File: `client/config/agent.json`

```json
{
  "serverUrl": "ws://localhost:3000/ws",
  "heartbeatInterval": 30000,
  "metricsInterval": 60000,
  "logLevel": "info"
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serverUrl` | string | "ws://localhost:3000/ws" | WebSocket URL of the RMM server |
| `heartbeatInterval` | number | 30000 | How often to send heartbeat (milliseconds) |
| `metricsInterval` | number | 60000 | How often to collect metrics (milliseconds) |
| `logLevel` | string | "info" | Logging level: "debug", "info", "warn", "error" |

### Required Configuration for Each Agent

**You MUST change `serverUrl` to point to your server:**

```json
{
  "serverUrl": "ws://192.168.1.100:3000/ws"
}
```

Or if using a domain:
```json
{
  "serverUrl": "wss://rmm.yourdomain.com/ws"
}
```

**Note:** Use `wss://` for secure WebSocket connections (requires HTTPS on server).

---

## Linux Service Configuration

### File: `client/config/rmm-agent.service`

This systemd service file controls how the agent runs as a system service on Linux.

### Important Settings to Modify

```ini
[Unit]
Description=RMM Agent
After=network.target

[Service]
Type=simple
User=root                    # ← Change if needed (requires root for some operations)
WorkingDirectory=/opt/rmm-agent    # ← Change to actual installation path
ExecStart=/usr/bin/node src/agent.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Installation Steps

1. Copy the service file:
```bash
sudo cp client/config/rmm-agent.service /etc/systemd/system/
```

2. Edit the service file to match your installation:
```bash
sudo nano /etc/systemd/system/rmm-agent.service
```

3. Update these fields:
   - `WorkingDirectory`: Path where agent is installed
   - `ExecStart`: Full path to node and agent.js
   - `User`: User to run as (root for full functionality)

4. Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable rmm-agent
sudo systemctl start rmm-agent
sudo systemctl status rmm-agent
```

5. View logs:
```bash
sudo journalctl -u rmm-agent -f
```

---

## Windows Service Configuration

### Using the Install Scripts

The agent can be installed as a Windows service using the provided scripts.

### Manual Configuration

Before running `npm run install-service`, ensure:

1. Edit `client/config/agent.json` with correct server URL
2. Install `node-windows` dependency:
```cmd
cd client
npm install node-windows
```

3. Run the installer:
```cmd
npm run install-service
```

### Service Details

- **Service Name:** RMM Agent
- **Startup Type:** Automatic
- **Log On:** Local System Account (with admin rights)

### Managing the Service

```cmd
# Check status
sc query "RMM Agent"

# Start service
sc start "RMM Agent"

# Stop service
sc stop "RMM Agent"

# Remove service
npm run uninstall-service
```

---

## Environment Variables

### Server Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | From config or 3000 |
| `HOST` | Server bind address | From config or 0.0.0.0 |
| `NODE_ENV` | Environment mode | development |
| `DATABASE_PATH` | SQLite database path | ./data/rmm.db |

**Example:**
```bash
PORT=8080 HOST=127.0.0.1 NODE_ENV=production npm start
```

### Agent Environment Variables

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Set to "production" when running as service |

---

## Quick Setup Checklist

### Server Setup
1. ✅ Install Node.js 18+ on server
2. ✅ Copy server folder to server
3. ✅ Run `npm install` in server directory
4. ✅ Edit `server/config/default.json`:
   - Set `host` to server IP
   - Adjust port if needed
5. ✅ Open firewall port (default: 3000)
6. ✅ Run `npm start`
7. ✅ Access dashboard at `http://server-ip:3000`

### Agent Setup (Each Machine)
1. ✅ Install Node.js 16+ on agent machine
2. ✅ Copy client folder to agent machine
3. ✅ Run `npm install` in client directory
4. ✅ **CRITICAL:** Edit `client/config/agent.json`:
   - Change `serverUrl` to `ws://server-ip:3000/ws`
5. ✅ Test with `npm start`
6. ✅ Install as service (optional but recommended):
   - Linux: Copy systemd service file
   - Windows: Run `npm run install-service`
7. ✅ Verify machine appears in dashboard

---

## Common Configuration Issues

### "Cannot connect to server" (Agent)
- Check `serverUrl` in `client/config/agent.json`
- Verify server is running: `http://server-ip:3000/health`
- Check firewall rules on server
- Test with telnet: `telnet server-ip 3000`

### Agent appears offline
- Check agent logs
- Verify network connectivity
- Check WebSocket URL format (must start with `ws://` or `wss://`)
- Ensure server port is accessible

### Dashboard not loading
- Check server logs for errors
- Verify port 3000 is not in use: `lsof -i :3000`
- Check if database directory exists and is writable

### Metrics not showing
- Check agent is online (green status)
- Verify `systeminformation` library supports your OS
- Check browser console for JavaScript errors

---

## Advanced Configuration

### Using HTTPS/WSS (Production)

1. Set up reverse proxy (Nginx/Apache) with SSL
2. Update agent config:
```json
{
  "serverUrl": "wss://your-domain.com/ws"
}
```

3. Server can remain on HTTP internally, proxy handles SSL

### Custom Database Location

```json
{
  "database": {
    "path": "/var/lib/rmm/rmm.db"
  }
}
```

Ensure the directory exists and is writable by the server process.

### Adjusting Collection Intervals

**For high-frequency monitoring:**
```json
{
  "metricsInterval": 10000,  // Every 10 seconds
  "heartbeatInterval": 15000  // Every 15 seconds
}
```

**For low-impact monitoring:**
```json
{
  "metricsInterval": 300000,  // Every 5 minutes
  "heartbeatInterval": 60000  // Every minute
}
```

---

## Security Recommendations

⚠️ **Current setup has NO authentication**

For production deployment:

1. **Add Authentication** - Implement JWT or session-based auth
2. **Use HTTPS/WSS** - Never use HTTP in production
3. **Firewall Rules** - Restrict port 3000 to authorized IPs only
4. **Rate Limiting** - Enable in config to prevent abuse
5. **VPN/Private Network** - Run on internal network only
6. **Regular Updates** - Keep Node.js and dependencies updated

---

## Configuration Examples

### Small Network (5-10 machines)
```json
// server/config/default.json
{
  "port": 3000,
  "host": "192.168.1.10",
  "cleanup": {
    "oldCommandsHours": 48,
    "metricsRetentionDays": 7,
    "logsRetentionDays": 3
  }
}

// client/config/agent.json (on each machine)
{
  "serverUrl": "ws://192.168.1.10:3000/ws",
  "metricsInterval": 60000
}
```

### Enterprise Setup (100+ machines)
```json
// server/config/default.json
{
  "port": 3000,
  "host": "10.0.0.5",
  "cleanup": {
    "oldCommandsHours": 24,
    "metricsRetentionDays": 90,
    "logsRetentionDays": 30
  },
  "security": {
    "corsEnabled": false,
    "rateLimitEnabled": true,
    "authEnabled": true
  }
}

// client/config/agent.json
{
  "serverUrl": "wss://rmm.company.com/ws",
  "heartbeatInterval": 60000,
  "metricsInterval": 120000
}
```

---

## Need Help?

- Check the [README.md](README.md) for setup instructions
- Review logs in console or systemd/journalctl
- Verify all configuration files are valid JSON
- Test connectivity between agent and server
