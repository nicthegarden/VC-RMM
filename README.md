# RMM Tool - Remote Monitoring & Management

A comprehensive, cross-platform Remote Monitoring and Management (RMM) solution built with Node.js. Monitor and manage Windows and Linux machines from a centralized web dashboard.

## Features

### Server Features
- **REST API** for machine management and data retrieval
- **WebSocket Support** for real-time communication
- **Web Dashboard** with responsive design
- **Machine Management** - Register, monitor, and control remote machines
- **Grouping** - Organize machines into logical groups
- **Command Execution** - Run shell commands and scripts remotely
- **File System Exploration** - Browse files on remote machines
- **Package Management** - Install, uninstall, and update packages
- **System Metrics** - Real-time CPU, memory, disk, and network monitoring
- **Logs Collection** - Windows Event Logs and Linux system logs
- **Remote Terminal** - Interactive shell access to remote machines

### Agent Features
- **Cross-Platform** - Runs on Windows, Linux, and macOS
- **Auto-Registration** - Automatically registers with the server
- **System Monitoring** - Collects and reports system metrics
- **Command Execution** - Executes shell commands and scripts
- **File Operations** - Browse, download, and upload files
- **Package Management** - Manage installed packages
- **Logs Collection** - Collects system and application logs
- **Service Mode** - Can run as a system service

## Project Structure

```
RMM/
├── server/                 # RMM Server
│   ├── src/
│   │   ├── app.js         # Main server application
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   └── websocket/     # WebSocket manager
│   ├── public/            # Web dashboard files
│   │   ├── css/
│   │   ├── js/
│   │   └── index.html
│   └── package.json
│
├── client/                # RMM Agent
│   ├── src/
│   │   ├── agent.js       # Main agent application
│   │   └── platform/      # Platform-specific modules
│   ├── config/
│   │   ├── agent.json     # Agent configuration
│   │   └── rmm-agent.service  # Linux systemd service
│   ├── scripts/
│   │   ├── install-service.js    # Windows service installer
│   │   └── uninstall-service.js  # Windows service uninstaller
│   └── package.json
│
└── README.md
```

## Quick Start

⚠️ **Important:** Before starting, review the [Configuration Guide](CONFIGURATION.md) for detailed setup instructions.

### Server Installation

1. Navigate to the server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

The server will start on port 3000 by default. Access the dashboard at `http://localhost:3000`

### Agent Installation

#### Linux

1. Navigate to the client directory:
```bash
cd client
```

2. Install dependencies:
```bash
npm install
```

3. Configure the agent:
Edit `config/agent.json` and set the server URL:
```json
{
  "serverUrl": "ws://your-server-ip:3000/ws"
}
```

4. Run the agent:
```bash
npm start
```

5. (Optional) Install as a systemd service:
```bash
sudo cp config/rmm-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable rmm-agent
sudo systemctl start rmm-agent
```

#### Windows

1. Navigate to the client directory:
```cmd
cd client
```

2. Install dependencies:
```cmd
npm install
```

3. Configure the agent:
Edit `config/agent.json` and set the server URL.

4. Run the agent:
```cmd
npm start
```

5. (Optional) Install as a Windows service:
```cmd
npm run install-service
```

## Configuration

### Server Configuration

The server uses the following environment variables:

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

### Agent Configuration

Edit `client/config/agent.json`:

```json
{
  "serverUrl": "ws://localhost:3000/ws",
  "heartbeatInterval": 30000,
  "metricsInterval": 60000,
  "logLevel": "info"
}
```

## API Documentation

### REST API Endpoints

#### Machines
- `GET /api/machines` - List all machines
- `GET /api/machines/:id` - Get machine details
- `GET /api/machines/:id/metrics` - Get machine metrics
- `GET /api/machines/:id/logs` - Get machine logs
- `GET /api/machines/:id/packages` - Get machine packages
- `GET /api/machines/:id/commands` - Get command history
- `PUT /api/machines/:id/group` - Update machine group
- `DELETE /api/machines/:id` - Remove machine

#### Groups
- `GET /api/groups` - List all groups
- `POST /api/groups` - Create group
- `GET /api/groups/:id/machines` - Get machines in group
- `PUT /api/groups/:id` - Update group
- `DELETE /api/groups/:id` - Delete group

#### Commands
- `GET /api/commands` - Get command history
- `POST /api/commands` - Execute command
- `GET /api/commands/:id` - Get command details

#### Logs
- `GET /api/logs` - Get all logs

#### Packages
- `GET /api/packages` - Get all packages
- `POST /api/packages/install` - Install package
- `POST /api/packages/uninstall` - Uninstall package
- `POST /api/packages/update` - Update all packages

#### Files
- `POST /api/files/upload` - Upload file to machine
- `POST /api/files/download` - Download file from machine

### WebSocket Protocol

Connect to `ws://server:3000/ws?type=dashboard` for the dashboard or `ws://server:3000/ws?type=agent&machineId=xxx` for agents.

## Building Executables

To build standalone executables for the agent:

```bash
cd client
npm run build
```

This will create executables in the `dist/` directory for Linux and Windows.

## Security Considerations

⚠️ **Important**: This RMM tool is designed for internal use and does not include authentication by default. For production use:

1. Add authentication (JWT, OAuth, etc.)
2. Use HTTPS/WSS instead of HTTP/WS
3. Implement IP whitelisting
4. Add rate limiting
5. Use firewall rules to restrict access
6. Regularly update dependencies

## Supported Platforms

### Server
- Linux (Ubuntu, CentOS, Debian)
- Windows Server 2016+
- macOS (limited support)

### Agent
- Windows 10/11
- Windows Server 2016/2019/2022
- Ubuntu 18.04+
- CentOS 7/8
- Debian 9+
- macOS 10.14+

## Package Managers Supported

### Linux
- apt (Debian/Ubuntu)
- yum/dnf (RHEL/CentOS/Fedora)
- pacman (Arch Linux)

### Windows
- winget (Windows Package Manager)

### macOS
- Homebrew

## Troubleshooting

### Agent won't connect
1. Check server URL in `config/agent.json`
2. Verify server is running and accessible
3. Check firewall rules
4. Review agent logs

### Metrics not showing
1. Verify agent is online
2. Check systeminformation compatibility with your OS
3. Review agent logs for errors

### Commands failing
1. Check user permissions on agent machine
2. Verify command exists on target platform
3. Review command output in dashboard

## Development

### Server Development
```bash
cd server
npm run dev
```

### Agent Development
```bash
cd client
npm run dev
```

## License

MIT

## Contributing

Contributions are welcome! Please submit pull requests or issues on GitHub.

## Support

For support, please open an issue on the GitHub repository.
