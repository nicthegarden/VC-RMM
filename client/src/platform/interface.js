const os = require('os');
const { exec, spawn } = require('child_process');
const si = require('systeminformation');

class PlatformInterface {
    constructor() {
        this.platform = os.platform();
        this.isWindows = this.platform === 'win32';
        this.isLinux = this.platform === 'linux';
        this.isMac = this.platform === 'darwin';
    }

    async reboot() {
        return new Promise((resolve, reject) => {
            let command;
            if (this.isWindows) {
                command = 'shutdown /r /t 0';
            } else if (this.isLinux || this.isMac) {
                command = 'reboot';
            } else {
                reject(new Error('Unsupported platform'));
                return;
            }

            exec(command, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    async shutdown() {
        return new Promise((resolve, reject) => {
            let command;
            if (this.isWindows) {
                command = 'shutdown /s /t 0';
            } else if (this.isLinux || this.isMac) {
                command = 'shutdown -h now';
            } else {
                reject(new Error('Unsupported platform'));
                return;
            }

            exec(command, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    async installPackage(packageName) {
        return new Promise((resolve, reject) => {
            let command;
            
            if (this.isWindows) {
                // Try to use winget (Windows Package Manager)
                command = `winget install "${packageName}" --accept-package-agreements --accept-source-agreements`;
            } else if (this.isLinux) {
                // Detect package manager
                command = this.detectPackageManager('install', packageName);
            } else if (this.isMac) {
                command = `brew install "${packageName}"`;
            } else {
                reject(new Error('Unsupported platform'));
                return;
            }

            exec(command, { timeout: 120000 }, (error, stdout, stderr) => {
                if (error) reject(new Error(stderr || error.message));
                else resolve(stdout);
            });
        });
    }

    async uninstallPackage(packageName) {
        return new Promise((resolve, reject) => {
            let command;
            
            if (this.isWindows) {
                command = `winget uninstall "${packageName}"`;
            } else if (this.isLinux) {
                command = this.detectPackageManager('remove', packageName);
            } else if (this.isMac) {
                command = `brew uninstall "${packageName}"`;
            } else {
                reject(new Error('Unsupported platform'));
                return;
            }

            exec(command, { timeout: 120000 }, (error, stdout, stderr) => {
                if (error) reject(new Error(stderr || error.message));
                else resolve(stdout);
            });
        });
    }

    async updatePackages() {
        return new Promise((resolve, reject) => {
            let command;
            
            if (this.isWindows) {
                command = 'winget upgrade --all';
            } else if (this.isLinux) {
                command = this.detectPackageManager('update');
            } else if (this.isMac) {
                command = 'brew upgrade';
            } else {
                reject(new Error('Unsupported platform'));
                return;
            }

            exec(command, { timeout: 300000 }, (error, stdout, stderr) => {
                if (error) reject(new Error(stderr || error.message));
                else resolve(stdout);
            });
        });
    }

    detectPackageManager(action, packageName = null) {
        const managers = {
            apt: {
                install: `apt-get install -y ${packageName}`,
                remove: `apt-get remove -y ${packageName}`,
                update: 'apt-get update && apt-get upgrade -y',
                list: 'dpkg -l | grep "^ii"'
            },
            yum: {
                install: `yum install -y ${packageName}`,
                remove: `yum remove -y ${packageName}`,
                update: 'yum update -y',
                list: 'yum list installed'
            },
            dnf: {
                install: `dnf install -y ${packageName}`,
                remove: `dnf remove -y ${packageName}`,
                update: 'dnf update -y',
                list: 'dnf list installed'
            },
            pacman: {
                install: `pacman -S --noconfirm ${packageName}`,
                remove: `pacman -R --noconfirm ${packageName}`,
                update: 'pacman -Syu --noconfirm',
                list: 'pacman -Q'
            }
        };

        // Detect available package manager
        if (this.commandExists('apt-get')) return managers.apt[action];
        if (this.commandExists('dnf')) return managers.dnf[action];
        if (this.commandExists('yum')) return managers.yum[action];
        if (this.commandExists('pacman')) return managers.pacman[action];
        
        throw new Error('No supported package manager found');
    }

    commandExists(command) {
        try {
            require('child_process').execSync(`which ${command}`, { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    }

    async getInstalledPackages() {
        return new Promise((resolve, reject) => {
            let command;
            
            if (this.isWindows) {
                // Use winget to list packages
                command = 'winget list';
            } else if (this.isLinux) {
                if (this.commandExists('dpkg')) {
                    command = 'dpkg-query -W -f=\'${Package}\t${Version}\n\'';
                } else if (this.commandExists('rpm')) {
                    command = 'rpm -qa --queryformat "%{NAME}\t%{VERSION}\n"';
                } else if (this.commandExists('pacman')) {
                    command = 'pacman -Q';
                } else {
                    resolve([]);
                    return;
                }
            } else if (this.isMac) {
                command = 'brew list --versions';
            } else {
                resolve([]);
                return;
            }

            exec(command, { timeout: 30000 }, (error, stdout) => {
                if (error) {
                    resolve([]);
                    return;
                }

                const packages = this.parsePackageList(stdout);
                resolve(packages);
            });
        });
    }

    parsePackageList(output) {
        const packages = [];
        const lines = output.split('\n').filter(line => line.trim());

        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
                packages.push({
                    name: parts[0],
                    version: parts[1] || 'unknown',
                    installed: true
                });
            }
        }

        return packages;
    }

    async getSystemLogs(hours = 24) {
        if (this.isWindows) {
            return this.getWindowsEventLogs(hours);
        } else if (this.isLinux) {
            return this.getLinuxLogs(hours);
        } else if (this.isMac) {
            return this.getMacLogs(hours);
        }
        return [];
    }

    async getWindowsEventLogs(hours) {
        return new Promise((resolve) => {
            const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
            
            // PowerShell command to get event logs
            const psCommand = `
                Get-WinEvent -FilterHashtable @{LogName='System','Application'; StartTime='${since}'} -ErrorAction SilentlyContinue | 
                Select-Object TimeCreated, LevelDisplayName, ProviderName, Id, Message | 
                ConvertTo-Json
            `;

            const child = spawn('powershell.exe', ['-Command', psCommand], {
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

            child.on('close', () => {
                try {
                    const events = JSON.parse(stdout);
                    const logs = (Array.isArray(events) ? events : [events]).map(event => ({
                        timestamp: event.TimeCreated,
                        level: this.mapWindowsLevel(event.LevelDisplayName),
                        source: event.ProviderName,
                        message: event.Message?.substring(0, 500) || '',
                        event_id: event.Id
                    }));
                    resolve(logs);
                } catch (err) {
                    resolve([]);
                }
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                child.kill();
                resolve([]);
            }, 30000);
        });
    }

    mapWindowsLevel(level) {
        const mapping = {
            'Critical': 'error',
            'Error': 'error',
            'Warning': 'warning',
            'Information': 'info',
            'Verbose': 'debug'
        };
        return mapping[level] || 'info';
    }

    async getLinuxLogs(hours) {
        return new Promise((resolve) => {
            // Use journalctl for systemd systems
            const command = `journalctl --since "${hours} hours ago" --no-pager -o json`;
            
            exec(command, { timeout: 30000 }, (error, stdout) => {
                if (error) {
                    // Fallback to reading log files
                    resolve(this.readLogFiles(hours));
                    return;
                }

                try {
                    const logs = stdout.split('\n')
                        .filter(line => line.trim())
                        .map(line => {
                            try {
                                const entry = JSON.parse(line);
                                return {
                                    timestamp: new Date(entry.__REALTIME_TIMESTAMP / 1000).toISOString(),
                                    level: this.mapLinuxPriority(entry.PRIORITY),
                                    source: entry.SYSLOG_IDENTIFIER || 'unknown',
                                    message: entry.MESSAGE || '',
                                    event_id: null
                                };
                            } catch {
                                return null;
                            }
                        })
                        .filter(Boolean);
                    
                    resolve(logs);
                } catch (err) {
                    resolve(this.readLogFiles(hours));
                }
            });
        });
    }

    mapLinuxPriority(priority) {
        const levels = ['emerg', 'alert', 'crit', 'error', 'warning', 'notice', 'info', 'debug'];
        return levels[priority] || 'info';
    }

    async readLogFiles(hours) {
        const fs = require('fs');
        const path = require('path');
        const logs = [];
        
        const logFiles = ['/var/log/syslog', '/var/log/messages', '/var/log/auth.log'];
        const since = Date.now() - hours * 60 * 60 * 1000;

        for (const logFile of logFiles) {
            try {
                if (!fs.existsSync(logFile)) continue;
                
                const stats = fs.statSync(logFile);
                if (stats.mtime.getTime() < since) continue;

                const content = fs.readFileSync(logFile, 'utf8');
                const lines = content.split('\n').slice(-1000); // Last 1000 lines

                for (const line of lines) {
                    const match = line.match(/^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/);
                    if (match) {
                        logs.push({
                            timestamp: new Date().toISOString(),
                            level: 'info',
                            source: path.basename(logFile),
                            message: line.substring(0, 500),
                            event_id: null
                        });
                    }
                }
            } catch (err) {
                // Continue with next file
            }
        }

        return logs;
    }

    async getMacLogs(hours) {
        return new Promise((resolve) => {
            const command = `log show --last ${hours}h --style json`;
            
            exec(command, { timeout: 30000 }, (error, stdout) => {
                if (error) {
                    resolve([]);
                    return;
                }

                try {
                    const events = JSON.parse(stdout);
                    const logs = events.map(event => ({
                        timestamp: event.timestamp,
                        level: this.mapMacLevel(event.eventType),
                        source: event.sender || 'unknown',
                        message: event.eventMessage || '',
                        event_id: null
                    }));
                    resolve(logs);
                } catch (err) {
                    resolve([]);
                }
            });
        });
    }

    mapMacLevel(type) {
        const mapping = {
            'error': 'error',
            'fault': 'error',
            'default': 'warning',
            'info': 'info',
            'debug': 'debug'
        };
        return mapping[type] || 'info';
    }
}

module.exports = PlatformInterface;
