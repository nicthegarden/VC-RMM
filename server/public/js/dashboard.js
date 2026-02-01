// Dashboard Application
class RMMDashboard {
    constructor() {
        this.machines = [];
        this.groups = [];
        this.currentMachine = null;
        this.ws = null;
        this.currentView = 'machines';
        this.currentPath = '/';
        this.terminalSession = null;
        
        this.init();
    }

    init() {
        this.connectWebSocket();
        this.setupEventListeners();
        this.loadMachines();
        this.loadGroups();
        this.loadCommands();
    }

    connectWebSocket() {
        const wsUrl = `ws://${window.location.host}/ws?type=dashboard`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.updateConnectionStatus(true);
            this.showToast('Connected to server', 'success');
        };

        this.ws.onclose = () => {
            this.updateConnectionStatus(false);
            this.showToast('Disconnected from server', 'warning');
            setTimeout(() => this.connectWebSocket(), 5000);
        };

        this.ws.onerror = (err) => {
            console.error('WebSocket error:', err);
            this.updateConnectionStatus(false);
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleWebSocketMessage(message);
        };
    }

    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'agent_status':
                this.updateMachineStatus(message.machineId, message.status);
                break;

            case 'machine_registered':
                this.loadMachines();
                this.showToast(`New machine registered: ${message.data.hostname}`, 'success');
                break;

            case 'metrics_update':
                this.updateMachineMetrics(message.machineId, message.data);
                break;

            case 'command_result':
                this.handleCommandResult(message);
                break;

            case 'logs_update':
                if (this.currentMachine === message.machineId) {
                    this.loadMachineLogs(message.machineId);
                }
                break;

            case 'packages_update':
                if (this.currentMachine === message.machineId) {
                    this.loadMachinePackages(message.machineId);
                }
                break;

            case 'file_listing':
                if (message.error) {
                    this.showToast(`Error: ${message.error}`, 'error');
                } else {
                    this.displayFileListing(message.path, message.files);
                }
                break;

            case 'file_content':
                if (message.error) {
                    this.showToast(`Error: ${message.error}`, 'error');
                } else {
                    this.displayFileContent(message.path, message.content);
                }
                break;

            case 'shell_output':
                this.displayTerminalOutput(message.output, message.isError);
                if (message.isComplete) {
                    this.terminalSession = null;
                }
                break;
        }
    }

    updateConnectionStatus(connected) {
        const dot = document.getElementById('connection-status');
        const text = document.getElementById('connection-text');
        
        if (connected) {
            dot.classList.add('connected');
            text.textContent = 'Connected';
        } else {
            dot.classList.remove('connected');
            text.textContent = 'Disconnected';
        }
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const view = item.dataset.view;
                this.switchView(view);
            });
        });

        // Refresh buttons
        document.getElementById('refresh-machines')?.addEventListener('click', () => this.loadMachines());
        document.getElementById('refresh-commands')?.addEventListener('click', () => this.loadCommands());
        document.getElementById('refresh-logs')?.addEventListener('click', () => this.loadLogs());
        document.getElementById('refresh-packages')?.addEventListener('click', () => this.loadPackages());

        // Modals
        document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.remove('active');
            });
        });

        // Group management
        document.getElementById('add-group-btn')?.addEventListener('click', () => this.showGroupModal());
        document.getElementById('create-group-btn')?.addEventListener('click', () => this.showGroupModal());
        document.getElementById('group-form')?.addEventListener('submit', (e) => this.createGroup(e));

        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Terminal
        document.getElementById('terminal-send')?.addEventListener('click', () => this.sendTerminalCommand());
        document.getElementById('terminal-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendTerminalCommand();
        });

        // File browser
        document.getElementById('file-back')?.addEventListener('click', () => this.navigateUp());
        document.getElementById('file-refresh')?.addEventListener('click', () => this.refreshFiles());

        // Command execution
        document.getElementById('command-type')?.addEventListener('change', (e) => {
            const inputGroup = document.getElementById('command-input-group');
            inputGroup.style.display = e.target.value === 'reboot' || e.target.value === 'shutdown' ? 'none' : 'block';
        });

        document.getElementById('execute-cmd-btn')?.addEventListener('click', () => this.executeRemoteCommand());

        // Filters
        document.getElementById('command-machine-filter')?.addEventListener('change', () => this.loadCommands());
        document.getElementById('logs-machine-filter')?.addEventListener('change', () => this.loadLogs());
        document.getElementById('logs-level-filter')?.addEventListener('change', () => this.loadLogs());
        document.getElementById('packages-machine-filter')?.addEventListener('change', () => this.loadPackages());
    }

    switchView(view) {
        this.currentView = view;
        
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`${view}-view`).classList.add('active');
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.view === view);
        });

        if (view === 'machines') this.loadMachines();
        if (view === 'groups') this.loadGroups();
        if (view === 'commands') this.loadCommands();
        if (view === 'logs') this.loadLogs();
        if (view === 'packages') this.loadPackages();
    }

    switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tab}-tab`);
        });

        if (tab === 'metrics' && this.currentMachine) {
            this.loadMachineMetrics(this.currentMachine);
        } else if (tab === 'logs' && this.currentMachine) {
            this.loadMachineLogs(this.currentMachine);
        } else if (tab === 'packages' && this.currentMachine) {
            this.loadMachinePackages(this.currentMachine);
        } else if (tab === 'files' && this.currentMachine) {
            this.loadFileListing('/');
        }
    }

    async loadMachines() {
        try {
            const response = await fetch('/api/machines');
            const result = await response.json();
            
            if (result.success) {
                this.machines = result.data;
                this.renderMachines();
                this.updateMachineFilters();
            }
        } catch (err) {
            console.error('Error loading machines:', err);
            this.showToast('Failed to load machines', 'error');
        }
    }

    renderMachines() {
        const container = document.getElementById('machines-container');
        if (!container) return;

        if (this.machines.length === 0) {
            container.innerHTML = '<div class="placeholder">No machines registered</div>';
            return;
        }

        container.innerHTML = this.machines.map(machine => `
            <div class="machine-card ${machine.status}" data-id="${machine.id}" onclick="dashboard.showMachineDetails('${machine.id}')">
                <div class="machine-header">
                    <div class="machine-name">${machine.hostname}</div>
                    <span class="machine-status ${machine.status}">${machine.status}</span>
                </div>
                <div class="machine-info-row">
                    <span class="machine-info-label">OS:</span>
                    <span>${machine.os} ${machine.os_version || ''}</span>
                </div>
                <div class="machine-info-row">
                    <span class="machine-info-label">IP:</span>
                    <span>${machine.ip_address || 'N/A'}</span>
                </div>
                <div class="machine-info-row">
                    <span class="machine-info-label">Group:</span>
                    <span>${machine.group_name || 'Default'}</span>
                </div>
                <div class="machine-info-row">
                    <span class="machine-info-label">Last Seen:</span>
                    <span>${new Date(machine.last_seen).toLocaleString()}</span>
                </div>
                ${machine.status === 'online' ? `
                <div class="machine-metrics-preview">
                    <div class="metric-badge">
                        <div class="metric-label">CPU</div>
                        <div class="metric-value" id="cpu-${machine.id}">--</div>
                    </div>
                    <div class="metric-badge">
                        <div class="metric-label">Memory</div>
                        <div class="metric-value" id="mem-${machine.id}">--</div>
                    </div>
                </div>
                ` : ''}
            </div>
        `).join('');
    }

    updateMachineStatus(machineId, status) {
        const machine = this.machines.find(m => m.id === machineId);
        if (machine) {
            machine.status = status;
            this.renderMachines();
        }
    }

    updateMachineMetrics(machineId, metrics) {
        const cpuEl = document.getElementById(`cpu-${machineId}`);
        const memEl = document.getElementById(`mem-${machineId}`);
        
        if (cpuEl) cpuEl.textContent = `${metrics.cpu_percent?.toFixed(1) || 0}%`;
        if (memEl) memEl.textContent = `${metrics.memory_percent?.toFixed(1) || 0}%`;

        if (this.currentMachine === machineId) {
            this.renderMetricsCharts(metrics);
        }
    }

    updateMachineFilters() {
        const machineOptions = this.machines.map(m => `<option value="${m.id}">${m.hostname}</option>`).join('');
        
        const cmdFilter = document.getElementById('command-machine-filter');
        const logsFilter = document.getElementById('logs-machine-filter');
        const pkgFilter = document.getElementById('packages-machine-filter');
        const cmdTarget = document.getElementById('command-target');

        if (cmdFilter) cmdFilter.innerHTML = '<option value="">All Machines</option>' + machineOptions;
        if (logsFilter) logsFilter.innerHTML = '<option value="">All Machines</option>' + machineOptions;
        if (pkgFilter) pkgFilter.innerHTML = '<option value="">Select Machine</option>' + machineOptions;
        if (cmdTarget) cmdTarget.innerHTML = '<option value="">Select target...</option>' + machineOptions;
    }

    async loadGroups() {
        try {
            const response = await fetch('/api/groups');
            const result = await response.json();
            
            if (result.success) {
                this.groups = result.data;
                this.renderGroups();
            }
        } catch (err) {
            console.error('Error loading groups:', err);
        }
    }

    renderGroups() {
        const container = document.getElementById('groups-container');
        if (!container) return;

        if (this.groups.length === 0) {
            container.innerHTML = '<div class="placeholder">No groups created</div>';
            return;
        }

        container.innerHTML = this.groups.map(group => `
            <div class="group-card">
                <div class="group-header">
                    <div class="group-name">${group.name}</div>
                    <div class="group-count">${group.machine_count || 0} machines</div>
                </div>
                <p>${group.description || 'No description'}</p>
                <div class="group-actions">
                    <button class="btn btn-primary" onclick="dashboard.viewGroupMachines('${group.id}')">View Machines</button>
                    ${group.id !== 'default' ? `
                    <button class="btn btn-secondary" onclick="dashboard.editGroup('${group.id}')">Edit</button>
                    <button class="btn btn-secondary" onclick="dashboard.deleteGroup('${group.id}')">Delete</button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    showGroupModal() {
        document.getElementById('group-modal').classList.add('active');
    }

    async createGroup(e) {
        e.preventDefault();
        
        const name = document.getElementById('group-name').value;
        const description = document.getElementById('group-description').value;

        try {
            const response = await fetch('/api/groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description })
            });

            const result = await response.json();
            
            if (result.success) {
                this.showToast('Group created successfully', 'success');
                document.getElementById('group-modal').classList.remove('active');
                document.getElementById('group-form').reset();
                this.loadGroups();
            } else {
                this.showToast(result.error || 'Failed to create group', 'error');
            }
        } catch (err) {
            this.showToast('Error creating group', 'error');
        }
    }

    async loadCommands() {
        try {
            const machineId = document.getElementById('command-machine-filter')?.value || '';
            const url = machineId ? `/api/commands?machineId=${machineId}` : '/api/commands';
            
            const response = await fetch(url);
            const result = await response.json();
            
            if (result.success) {
                this.renderCommands(result.data);
            }
        } catch (err) {
            console.error('Error loading commands:', err);
        }
    }

    renderCommands(commands) {
        const container = document.getElementById('commands-container');
        if (!container) return;

        if (commands.length === 0) {
            container.innerHTML = '<div class="placeholder">No commands executed</div>';
            return;
        }

        container.innerHTML = commands.map(cmd => `
            <div class="command-item">
                <div class="command-text" title="${cmd.command}">${cmd.command}</div>
                <div>${cmd.hostname || cmd.machine_id?.substring(0, 8) || 'N/A'}</div>
                <div>${new Date(cmd.created_at).toLocaleString()}</div>
                <div class="command-status">
                    <span class="status-badge ${cmd.status}">${cmd.status}</span>
                </div>
            </div>
        `).join('');
    }

    async loadLogs() {
        try {
            const machineId = document.getElementById('logs-machine-filter')?.value || '';
            const level = document.getElementById('logs-level-filter')?.value || '';
            
            let url = '/api/logs?';
            if (machineId) url += `machineId=${machineId}&`;
            if (level) url += `level=${level}`;
            
            const response = await fetch(url);
            const result = await response.json();
            
            if (result.success) {
                this.renderLogs(result.data);
            }
        } catch (err) {
            console.error('Error loading logs:', err);
        }
    }

    renderLogs(logs) {
        const container = document.getElementById('logs-container');
        if (!container) return;

        if (logs.length === 0) {
            container.innerHTML = '<div class="placeholder">No logs found</div>';
            return;
        }

        container.innerHTML = logs.map(log => `
            <div class="log-item">
                <div>${new Date(log.timestamp).toLocaleString()}</div>
                <div class="log-level">
                    <span class="level-badge ${log.level}">${log.level}</span>
                </div>
                <div>${log.source || 'N/A'}</div>
                <div>${log.message}</div>
            </div>
        `).join('');
    }

    async loadPackages() {
        const machineId = document.getElementById('packages-machine-filter')?.value;
        if (!machineId) return;

        try {
            const response = await fetch(`/api/packages?machineId=${machineId}`);
            const result = await response.json();
            
            if (result.success) {
                this.renderPackages(result.data, machineId);
            }
        } catch (err) {
            console.error('Error loading packages:', err);
        }
    }

    renderPackages(packages, machineId) {
        const container = document.getElementById('packages-container');
        if (!container) return;

        if (packages.length === 0) {
            container.innerHTML = '<div class="placeholder">No packages found</div>';
            return;
        }

        container.innerHTML = packages.map(pkg => `
            <div class="package-item">
                <div>${pkg.name}</div>
                <div>${pkg.version || 'N/A'}</div>
                <div class="package-actions">
                    <button class="btn btn-small btn-secondary" onclick="dashboard.uninstallPackage('${machineId}', '${pkg.name}')">Uninstall</button>
                </div>
            </div>
        `).join('');
    }

    showMachineDetails(machineId) {
        const machine = this.machines.find(m => m.id === machineId);
        if (!machine) return;

        this.currentMachine = machineId;
        this.terminalSession = null;
        
        document.getElementById('machine-modal-title').textContent = machine.hostname;
        
        // Update machine info
        document.getElementById('machine-info').innerHTML = `
            <div class="machine-info-row">
                <span class="machine-info-label">ID:</span>
                <span>${machine.id}</span>
            </div>
            <div class="machine-info-row">
                <span class="machine-info-label">Hostname:</span>
                <span>${machine.hostname}</span>
            </div>
            <div class="machine-info-row">
                <span class="machine-info-label">OS:</span>
                <span>${machine.os} ${machine.os_version || ''} (${machine.arch || 'Unknown'})</span>
            </div>
            <div class="machine-info-row">
                <span class="machine-info-label">IP Address:</span>
                <span>${machine.ip_address || 'N/A'}</span>
            </div>
            <div class="machine-info-row">
                <span class="machine-info-label">MAC Address:</span>
                <span>${machine.mac_address || 'N/A'}</span>
            </div>
            <div class="machine-info-row">
                <span class="machine-info-label">CPU Count:</span>
                <span>${machine.cpu_count || 'N/A'}</span>
            </div>
            <div class="machine-info-row">
                <span class="machine-info-label">Total Memory:</span>
                <span>${machine.total_memory ? (machine.total_memory / 1024 / 1024 / 1024).toFixed(2) + ' GB' : 'N/A'}</span>
            </div>
            <div class="machine-info-row">
                <span class="machine-info-label">Status:</span>
                <span class="machine-status ${machine.status}">${machine.status}</span>
            </div>
            <div class="machine-info-row">
                <span class="machine-info-label">Last Seen:</span>
                <span>${new Date(machine.last_seen).toLocaleString()}</span>
            </div>
        `;

        document.getElementById('machine-modal').classList.add('active');
        
        // Reset tabs
        this.switchTab('overview');
        
        // Request current metrics
        if (this.ws && machine.status === 'online') {
            this.ws.send(JSON.stringify({
                type: 'request_metrics',
                machineId: machineId
            }));
        }
    }

    async loadMachineMetrics(machineId) {
        try {
            const response = await fetch(`/api/machines/${machineId}/metrics?hours=1`);
            const result = await response.json();
            
            if (result.success && result.data.length > 0) {
                const latest = result.data[0];
                this.renderMetricsCharts(latest);
            }
        } catch (err) {
            console.error('Error loading metrics:', err);
        }
    }

    renderMetricsCharts(metrics) {
        const container = document.getElementById('metrics-container');
        if (!container) return;

        container.innerHTML = `
            <div class="metric-card">
                <h3>CPU Usage</h3>
                <div class="metric-value-large">${metrics.cpu_percent?.toFixed(1) || 0}%</div>
                <div class="metric-chart"></div>
            </div>
            <div class="metric-card">
                <h3>Memory Usage</h3>
                <div class="metric-value-large">${metrics.memory_percent?.toFixed(1) || 0}%</div>
                <div class="metric-chart"></div>
            </div>
            <div class="metric-card">
                <h3>Disk Usage</h3>
                <div class="metric-value-large">${metrics.disk_percent?.toFixed(1) || 0}%</div>
                <div class="metric-chart"></div>
            </div>
            <div class="metric-card">
                <h3>Network</h3>
                <div style="font-size: 0.875rem; margin-top: 8px;">
                    <div>Sent: ${(metrics.network_sent / 1024 / 1024).toFixed(2)} MB</div>
                    <div>Recv: ${(metrics.network_recv / 1024 / 1024).toFixed(2)} MB</div>
                </div>
            </div>
        `;
    }

    async loadMachineLogs(machineId) {
        try {
            const response = await fetch(`/api/machines/${machineId}/logs?limit=100`);
            const result = await response.json();
            
            if (result.success) {
                const container = document.getElementById('machine-logs-container');
                if (container) {
                    if (result.data.length === 0) {
                        container.innerHTML = '<div class="placeholder">No logs available</div>';
                    } else {
                        container.innerHTML = result.data.map(log => `
                            <div class="log-item">
                                <div>${new Date(log.timestamp).toLocaleString()}</div>
                                <div class="log-level"><span class="level-badge ${log.level}">${log.level}</span></div>
                                <div>${log.source || 'N/A'}</div>
                                <div>${log.message}</div>
                            </div>
                        `).join('');
                    }
                }
            }
        } catch (err) {
            console.error('Error loading machine logs:', err);
        }
    }

    async loadMachinePackages(machineId) {
        try {
            const response = await fetch(`/api/machines/${machineId}/packages`);
            const result = await response.json();
            
            if (result.success) {
                const container = document.getElementById('machine-packages-container');
                if (container) {
                    if (result.data.length === 0) {
                        container.innerHTML = '<div class="placeholder">No packages available</div>';
                    } else {
                        container.innerHTML = result.data.map(pkg => `
                            <div class="package-item">
                                <div>${pkg.name}</div>
                                <div>${pkg.version || 'N/A'}</div>
                                <div class="package-actions">
                                    <button class="btn btn-small btn-secondary" onclick="dashboard.uninstallPackage('${machineId}', '${pkg.name}')">Uninstall</button>
                                </div>
                            </div>
                        `).join('');
                    }
                }
            }
        } catch (err) {
            console.error('Error loading machine packages:', err);
        }
    }

    executeCommand(type, command) {
        if (!this.currentMachine) return;
        
        if (this.ws) {
            this.ws.send(JSON.stringify({
                type: 'execute_command',
                machineId: this.currentMachine,
                commandType: type,
                command: command
            }));
            
            this.showToast(`Command sent: ${command}`, 'success');
        }
    }

    sendTerminalCommand() {
        const input = document.getElementById('terminal-input');
        const command = input.value.trim();
        
        if (!command || !this.currentMachine) return;

        this.displayTerminalOutput(`$ ${command}`, false);
        
        if (this.ws) {
            this.ws.send(JSON.stringify({
                type: 'shell_input',
                machineId: this.currentMachine,
                sessionId: this.terminalSession || Date.now().toString(),
                input: command + '\n'
            }));
            
            this.terminalSession = this.terminalSession || Date.now().toString();
        }
        
        input.value = '';
    }

    displayTerminalOutput(output, isError) {
        const container = document.getElementById('terminal-output');
        if (!container) return;

        const line = document.createElement('div');
        line.textContent = output;
        if (isError) line.style.color = '#ef4444';
        
        container.appendChild(line);
        container.scrollTop = container.scrollHeight;
    }

    loadFileListing(path) {
        this.currentPath = path;
        document.getElementById('current-path').textContent = path;
        
        if (this.ws && this.currentMachine) {
            this.ws.send(JSON.stringify({
                type: 'get_file_listing',
                machineId: this.currentMachine,
                requestId: Date.now().toString(),
                path: path
            }));
        }
    }

    displayFileListing(path, files) {
        const container = document.getElementById('file-list');
        if (!container) return;

        this.currentPath = path;
        document.getElementById('current-path').textContent = path;

        let html = '';
        
        if (path !== '/') {
            html += `
                <div class="file-item" onclick="dashboard.navigateToParent()">
                    <span class="file-icon">📁</span>
                    <span class="file-name">..</span>
                </div>
            `;
        }

        files.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });

        html += files.map(file => `
            <div class="file-item" onclick="${file.isDirectory ? `dashboard.navigateToDirectory('${file.name}')` : `dashboard.viewFile('${file.name}')`}">
                <span class="file-icon">${file.isDirectory ? '📁' : '📄'}</span>
                <span class="file-name">${file.name}</span>
                <span class="file-size">${file.size ? this.formatBytes(file.size) : ''}</span>
                <span class="file-date">${file.modified ? new Date(file.modified).toLocaleString() : ''}</span>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    navigateToDirectory(name) {
        const newPath = this.currentPath === '/' ? `/${name}` : `${this.currentPath}/${name}`;
        this.loadFileListing(newPath);
    }

    navigateToParent() {
        const parts = this.currentPath.split('/').filter(p => p);
        parts.pop();
        const newPath = parts.length === 0 ? '/' : '/' + parts.join('/');
        this.loadFileListing(newPath);
    }

    navigateUp() {
        this.navigateToParent();
    }

    refreshFiles() {
        this.loadFileListing(this.currentPath);
    }

    viewFile(name) {
        const filePath = this.currentPath === '/' ? `/${name}` : `${this.currentPath}/${name}`;
        
        if (this.ws && this.currentMachine) {
            this.ws.send(JSON.stringify({
                type: 'get_file_content',
                machineId: this.currentMachine,
                requestId: Date.now().toString(),
                path: filePath
            }));
        }
    }

    displayFileContent(path, content) {
        alert(`File: ${path}\n\n${content.substring(0, 2000)}${content.length > 2000 ? '...' : ''}`);
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async executeRemoteCommand() {
        const targetType = document.getElementById('command-target-type').value;
        const target = document.getElementById('command-target').value;
        const cmdType = document.getElementById('command-type').value;
        const cmdText = document.getElementById('command-text').value;

        if (!target) {
            this.showToast('Please select a target', 'error');
            return;
        }

        if (cmdType !== 'reboot' && cmdType !== 'shutdown' && !cmdText) {
            this.showToast('Please enter a command', 'error');
            return;
        }

        try {
            const body = {
                type: cmdType,
                command: cmdType === 'reboot' ? 'reboot' : cmdType === 'shutdown' ? 'shutdown' : cmdText
            };

            if (targetType === 'machine') {
                body.machineId = target;
            } else {
                body.groupId = target;
            }

            const response = await fetch('/api/commands', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('Command sent successfully', 'success');
                document.getElementById('command-modal').classList.remove('active');
                this.loadCommands();
            } else {
                this.showToast(result.error || 'Failed to send command', 'error');
            }
        } catch (err) {
            this.showToast('Error sending command', 'error');
        }
    }

    handleCommandResult(message) {
        if (message.output || message.error) {
            const outputSection = document.getElementById('command-output-section');
            const outputEl = document.getElementById('command-output');
            
            if (outputSection && outputEl) {
                outputSection.style.display = 'block';
                outputEl.textContent = message.output || message.error;
            }
        }
        
        this.loadCommands();
    }

    requestReboot() {
        if (confirm('Are you sure you want to reboot this machine?')) {
            this.executeCommand('reboot', 'reboot');
        }
    }

    requestShutdown() {
        if (confirm('Are you sure you want to shutdown this machine?')) {
            this.executeCommand('shutdown', 'shutdown');
        }
    }

    async uninstallPackage(machineId, packageName) {
        if (!confirm(`Are you sure you want to uninstall ${packageName}?`)) return;

        try {
            const response = await fetch('/api/packages/uninstall', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ machineId, packageName })
            });

            const result = await response.json();

            if (result.success) {
                this.showToast(`Uninstall requested: ${packageName}`, 'success');
            } else {
                this.showToast(result.error || 'Failed to uninstall package', 'error');
            }
        } catch (err) {
            this.showToast('Error uninstalling package', 'error');
        }
    }

    viewGroupMachines(groupId) {
        // Filter machines by group
        const groupMachines = this.machines.filter(m => m.group_id === groupId);
        const group = this.groups.find(g => g.id === groupId);
        
        alert(`Group: ${group?.name || 'Unknown'}\nMachines: ${groupMachines.map(m => m.hostname).join(', ') || 'None'}`);
    }

    editGroup(groupId) {
        // Implementation for editing group
        this.showToast('Edit group functionality coming soon', 'warning');
    }

    async deleteGroup(groupId) {
        if (!confirm('Are you sure you want to delete this group? Machines will be moved to default.')) return;

        try {
            const response = await fetch(`/api/groups/${groupId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('Group deleted successfully', 'success');
                this.loadGroups();
                this.loadMachines();
            } else {
                this.showToast(result.error || 'Failed to delete group', 'error');
            }
        } catch (err) {
            this.showToast('Error deleting group', 'error');
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }
}

// Initialize dashboard
const dashboard = new RMMDashboard();
