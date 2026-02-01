const WebSocket = require('ws');
const si = require('systeminformation');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');

// Platform-specific modules
const PlatformInterface = require('./platform/interface');

class RMMAgent {
    constructor() {
        this.config = this.loadConfig();
        this.machineId = this.loadMachineId();
        this.ws = null;
        this.reconnectInterval = 5000;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.heartbeatInterval = null;
        this.metricsInterval = null;
        this.platform = new PlatformInterface();
        this.activeShells = new Map();
    }

    loadConfig() {
        const configPath = path.join(__dirname, '../config/agent.json');
        const defaultConfig = {
            serverUrl: 'ws://localhost:3000/ws',
            heartbeatInterval: 30000,
            metricsInterval: 60000,
            logLevel: 'info'
        };

        try {
            if (fs.existsSync(configPath)) {
                const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                return { ...defaultConfig, ...userConfig };
            }
        } catch (err) {
            console.error('Error loading config:', err);
        }

        return defaultConfig;
    }

    loadMachineId() {
        const idPath = path.join(__dirname, '../data/machine.id');
        
        try {
            if (fs.existsSync(idPath)) {
                return fs.readFileSync(idPath, 'utf8').trim();
            }
        } catch (err) {
            console.error('Error loading machine ID:', err);
        }

        // Generate new ID
        const newId = uuidv4();
        try {
            fs.mkdirSync(path.dirname(idPath), { recursive: true });
            fs.writeFileSync(idPath, newId);
        } catch (err) {
            console.error('Error saving machine ID:', err);
        }

        return newId;
    }

    async start() {
        console.log(`RMM Agent Starting...`);
        console.log(`Machine ID: ${this.machineId}`);
        console.log(`Platform: ${os.platform()} (${os.arch()})`);

        await this.connect();
    }

    async connect() {
        try {
            const wsUrl = `${this.config.serverUrl}?type=agent&machineId=${this.machineId}`;
            console.log(`Connecting to ${this.config.serverUrl}...`);

            this.ws = new WebSocket(wsUrl);

            this.ws.on('open', () => {
                console.log('Connected to server');
                this.reconnectAttempts = 0;
                this.registerMachine();
                this.startHeartbeat();
                this.startMetricsCollection();
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleMessage(message);
                } catch (err) {
                    console.error('Error parsing message:', err);
                }
            });

            this.ws.on('close', () => {
                console.log('Disconnected from server');
                this.stopHeartbeat();
                this.stopMetricsCollection();
                this.scheduleReconnect();
            });

            this.ws.on('error', (err) => {
                console.error('WebSocket error:', err.message);
            });

        } catch (err) {
            console.error('Connection error:', err);
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached. Giving up.');
            process.exit(1);
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectInterval * this.reconnectAttempts, 60000);
        
        console.log(`Reconnecting in ${delay / 1000} seconds... (attempt ${this.reconnectAttempts})`);
        setTimeout(() => this.connect(), delay);
    }

    async registerMachine() {
        const systemData = await this.collectSystemInfo();
        
        this.send({
            type: 'register',
            data: systemData
        });

        console.log('Machine registered');
    }

    async collectSystemInfo() {
        const [system, osInfo, cpu, mem, network] = await Promise.all([
            si.system(),
            si.osInfo(),
            si.cpu(),
            si.mem(),
            si.networkInterfaces()
        ]);

        const mainNetwork = network.find(n => n.ip4 && !n.internal) || network[0];

        return {
            id: this.machineId,
            hostname: os.hostname(),
            os: osInfo.platform,
            os_version: osInfo.release,
            arch: osInfo.arch,
            cpu_count: cpu.cores,
            total_memory: mem.total,
            ip_address: mainNetwork?.ip4 || '127.0.0.1',
            mac_address: mainNetwork?.mac || '00:00:00:00:00:00'
        };
    }

    async collectMetrics() {
        try {
            const [cpu, mem, disk, network] = await Promise.all([
                si.currentLoad(),
                si.mem(),
                si.fsSize(),
                si.networkStats()
            ]);

            const mainDisk = disk[0] || {};
            const mainNetwork = network[0] || { tx_sec: 0, rx_sec: 0 };

            return {
                cpu_percent: cpu.currentLoad || 0,
                memory_percent: (mem.used / mem.total) * 100 || 0,
                memory_used: mem.used || 0,
                memory_total: mem.total || 0,
                disk_percent: mainDisk.use || 0,
                disk_used: mainDisk.used || 0,
                disk_total: mainDisk.size || 0,
                network_sent: mainNetwork.tx_sec || 0,
                network_recv: mainNetwork.rx_sec || 0
            };
        } catch (err) {
            console.error('Error collecting metrics:', err);
            return null;
        }
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.send({ type: 'heartbeat' });
        }, this.config.heartbeatInterval);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    startMetricsCollection() {
        // Send initial metrics
        this.sendMetrics();

        this.metricsInterval = setInterval(() => {
            this.sendMetrics();
        }, this.config.metricsInterval);
    }

    stopMetricsCollection() {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
        }
    }

    async sendMetrics() {
        const metrics = await this.collectMetrics();
        if (metrics) {
            this.send({
                type: 'metrics',
                data: metrics
            });
        }
    }

    handleMessage(message) {
        switch (message.type) {
            case 'connected':
                console.log('Server acknowledged connection');
                break;

            case 'execute_command':
                this.executeCommand(message);
                break;

            case 'get_file_listing':
                this.getFileListing(message);
                break;

            case 'get_file_content':
                this.getFileContent(message);
                break;

            case 'upload_file':
                this.uploadFile(message);
                break;

            case 'download_file':
                this.downloadFile(message);
                break;

            case 'shell_input':
                this.handleShellInput(message);
                break;

            case 'close_shell':
                this.closeShell(message);
                break;

            case 'install_package':
                this.installPackage(message);
                break;

            case 'uninstall_package':
                this.uninstallPackage(message);
                break;

            case 'update_packages':
                this.updatePackages(message);
                break;

            case 'request_metrics':
                this.sendMetrics();
                break;

            case 'request_logs':
                this.sendLogs(message.hours || 24);
                break;

            case 'request_packages':
                this.sendPackages();
                break;

            default:
                console.log('Unknown message type:', message.type);
        }
    }

    async executeCommand(message) {
        const { commandId, commandType, command } = message;
        
        try {
            this.send({
                type: 'command_result',
                commandId,
                status: 'executing'
            });

            let output = '';
            let error = null;

            switch (commandType) {
                case 'shell':
                    ({ output, error } = await this.runShellCommand(command));
                    break;
                case 'script':
                    ({ output, error } = await this.runScript(command));
                    break;
                case 'reboot':
                    await this.platform.reboot();
                    output = 'Reboot initiated';
                    break;
                case 'shutdown':
                    await this.platform.shutdown();
                    output = 'Shutdown initiated';
                    break;
                default:
                    error = `Unknown command type: ${commandType}`;
            }

            this.send({
                type: 'command_result',
                commandId,
                status: error ? 'failed' : 'completed',
                output: output || null,
                error: error || null
            });

        } catch (err) {
            this.send({
                type: 'command_result',
                commandId,
                status: 'failed',
                error: err.message
            });
        }
    }

    runShellCommand(command) {
        return new Promise((resolve) => {
            const shell = os.platform() === 'win32' ? 'cmd' : 'sh';
            const shellFlag = os.platform() === 'win32' ? '/c' : '-c';
            
            const child = spawn(shell, [shellFlag, command], {
                cwd: process.cwd(),
                env: process.env,
                windowsHide: true
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                resolve({
                    output: stdout || null,
                    error: code !== 0 ? (stderr || `Exit code: ${code}`) : null
                });
            });

            child.on('error', (err) => {
                resolve({
                    output: null,
                    error: err.message
                });
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                child.kill();
                resolve({
                    output: stdout || null,
                    error: stderr || 'Command timed out'
                });
            }, 30000);
        });
    }

    runScript(script) {
        return new Promise((resolve) => {
            const isWindows = os.platform() === 'win32';
            const extension = isWindows ? '.ps1' : '.sh';
            const scriptPath = path.join(os.tmpdir(), `rmm_script_${Date.now()}${extension}`);

            fs.writeFileSync(scriptPath, script);

            let command;
            if (isWindows) {
                command = `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;
            } else {
                fs.chmodSync(scriptPath, '755');
                command = `"${scriptPath}"`;
            }

            exec(command, { timeout: 30000, windowsHide: true }, (error, stdout, stderr) => {
                // Clean up
                try {
                    fs.unlinkSync(scriptPath);
                } catch (err) {
                    // Ignore cleanup errors
                }

                resolve({
                    output: stdout || null,
                    error: error ? (stderr || error.message) : (stderr || null)
                });
            });
        });
    }

    getFileListing(message) {
        const { requestId, path: dirPath } = message;
        
        try {
            const resolvedPath = path.resolve(dirPath);
            const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
            
            const files = entries.map(entry => {
                const fullPath = path.join(resolvedPath, entry.name);
                let stats = null;
                
                try {
                    stats = fs.statSync(fullPath);
                } catch (err) {
                    // Permission denied or other error
                }

                return {
                    name: entry.name,
                    isDirectory: entry.isDirectory(),
                    size: stats?.size || 0,
                    modified: stats?.mtime || null
                };
            });

            this.send({
                type: 'file_listing',
                requestId,
                path: dirPath,
                files
            });
        } catch (err) {
            this.send({
                type: 'file_listing',
                requestId,
                path: dirPath,
                error: err.message
            });
        }
    }

    getFileContent(message) {
        const { requestId, path: filePath } = message;
        
        try {
            const resolvedPath = path.resolve(filePath);
            
            // Check file size (limit to 1MB)
            const stats = fs.statSync(resolvedPath);
            if (stats.size > 1024 * 1024) {
                throw new Error('File too large (max 1MB)');
            }

            const content = fs.readFileSync(resolvedPath, 'utf8');

            this.send({
                type: 'file_content',
                requestId,
                path: filePath,
                content
            });
        } catch (err) {
            this.send({
                type: 'file_content',
                requestId,
                path: filePath,
                error: err.message
            });
        }
    }

    uploadFile(message) {
        const { destinationPath, content } = message;
        
        try {
            const resolvedPath = path.resolve(destinationPath);
            fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
            fs.writeFileSync(resolvedPath, Buffer.from(content, 'base64'));
            
            console.log(`File uploaded: ${destinationPath}`);
        } catch (err) {
            console.error('File upload error:', err);
        }
    }

    downloadFile(message) {
        const { sourcePath } = message;
        
        try {
            const resolvedPath = path.resolve(sourcePath);
            const content = fs.readFileSync(resolvedPath);
            
            // File content is sent as base64 through file_listing for simplicity
            this.send({
                type: 'file_content',
                path: sourcePath,
                content: content.toString('base64'),
                isBinary: true
            });
        } catch (err) {
            console.error('File download error:', err);
        }
    }

    handleShellInput(message) {
        const { sessionId, input } = message;
        
        if (!this.activeShells.has(sessionId)) {
            // Start new shell
            const isWindows = os.platform() === 'win32';
            const shell = isWindows ? 'powershell.exe' : process.env.SHELL || '/bin/bash';
            
            const child = spawn(shell, [], {
                cwd: process.cwd(),
                env: process.env,
                windowsHide: true
            });

            this.activeShells.set(sessionId, child);

            child.stdout.on('data', (data) => {
                this.send({
                    type: 'shell_output',
                    sessionId,
                    output: data.toString(),
                    isError: false
                });
            });

            child.stderr.on('data', (data) => {
                this.send({
                    type: 'shell_output',
                    sessionId,
                    output: data.toString(),
                    isError: true
                });
            });

            child.on('close', () => {
                this.activeShells.delete(sessionId);
                this.send({
                    type: 'shell_output',
                    sessionId,
                    output: '',
                    isError: false,
                    isComplete: true
                });
            });

            // Send initial input
            setTimeout(() => {
                child.stdin.write(input);
            }, 500);
        } else {
            // Send to existing shell
            const shell = this.activeShells.get(sessionId);
            shell.stdin.write(input);
        }
    }

    closeShell(message) {
        const { sessionId } = message;
        
        if (this.activeShells.has(sessionId)) {
            const shell = this.activeShells.get(sessionId);
            shell.kill();
            this.activeShells.delete(sessionId);
        }
    }

    async installPackage(message) {
        const { packageName } = message;
        
        try {
            const result = await this.platform.installPackage(packageName);
            console.log(`Package installed: ${packageName}`);
            // Refresh packages list
            this.sendPackages();
        } catch (err) {
            console.error('Package install error:', err);
        }
    }

    async uninstallPackage(message) {
        const { packageName } = message;
        
        try {
            const result = await this.platform.uninstallPackage(packageName);
            console.log(`Package uninstalled: ${packageName}`);
            // Refresh packages list
            this.sendPackages();
        } catch (err) {
            console.error('Package uninstall error:', err);
        }
    }

    async updatePackages(message) {
        try {
            const result = await this.platform.updatePackages();
            console.log('Packages updated');
            // Refresh packages list
            this.sendPackages();
        } catch (err) {
            console.error('Package update error:', err);
        }
    }

    async sendPackages() {
        try {
            const packages = await this.platform.getInstalledPackages();
            
            this.send({
                type: 'packages',
                data: packages
            });
        } catch (err) {
            console.error('Error sending packages:', err);
        }
    }

    async sendLogs(hours = 24) {
        try {
            const logs = await this.platform.getSystemLogs(hours);
            
            this.send({
                type: 'logs',
                data: logs
            });
        } catch (err) {
            console.error('Error sending logs:', err);
        }
    }

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    stop() {
        console.log('Stopping agent...');
        this.stopHeartbeat();
        this.stopMetricsCollection();
        
        // Close all active shells
        this.activeShells.forEach((shell) => {
            shell.kill();
        });
        this.activeShells.clear();

        if (this.ws) {
            this.ws.close();
        }
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    agent.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    agent.stop();
    process.exit(0);
});

// Start agent
const agent = new RMMAgent();
agent.start().catch(err => {
    console.error('Failed to start agent:', err);
    process.exit(1);
});
