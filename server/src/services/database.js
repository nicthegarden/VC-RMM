const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class DatabaseService {
  constructor() {
    const dbPath = path.join(__dirname, '../../data/rmm.db');
    require('fs').mkdirSync(path.dirname(dbPath), { recursive: true });
    
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Database connection failed:', err);
      } else {
        console.log('Connected to SQLite database');
        this.initTables();
      }
    });
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS machines (
        id TEXT PRIMARY KEY,
        hostname TEXT NOT NULL,
        os TEXT NOT NULL,
        os_version TEXT,
        arch TEXT,
        cpu_count INTEGER,
        total_memory REAL,
        ip_address TEXT,
        mac_address TEXT,
        group_id TEXT,
        status TEXT DEFAULT 'offline',
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups(id)
      );

      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS commands (
        id TEXT PRIMARY KEY,
        machine_id TEXT,
        group_id TEXT,
        type TEXT NOT NULL,
        command TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        output TEXT,
        error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        executed_at TIMESTAMP,
        completed_at TIMESTAMP,
        FOREIGN KEY (machine_id) REFERENCES machines(id),
        FOREIGN KEY (group_id) REFERENCES groups(id)
      );

      CREATE TABLE IF NOT EXISTS system_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_id TEXT NOT NULL,
        cpu_percent REAL,
        memory_percent REAL,
        memory_used REAL,
        memory_total REAL,
        disk_percent REAL,
        disk_used REAL,
        disk_total REAL,
        network_sent REAL,
        network_recv REAL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (machine_id) REFERENCES machines(id)
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_id TEXT NOT NULL,
        level TEXT,
        source TEXT,
        message TEXT,
        event_id INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (machine_id) REFERENCES machines(id)
      );

      CREATE TABLE IF NOT EXISTS packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_id TEXT NOT NULL,
        name TEXT NOT NULL,
        version TEXT,
        installed BOOLEAN DEFAULT 1,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (machine_id) REFERENCES machines(id)
      );

      CREATE TABLE IF NOT EXISTS file_transfers (
        id TEXT PRIMARY KEY,
        machine_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        source_path TEXT,
        destination_path TEXT,
        status TEXT DEFAULT 'pending',
        size INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        FOREIGN KEY (machine_id) REFERENCES machines(id)
      );

      CREATE INDEX IF NOT EXISTS idx_machines_group ON machines(group_id);
      CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);
      CREATE INDEX IF NOT EXISTS idx_commands_machine ON commands(machine_id);
      CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(status);
      CREATE INDEX IF NOT EXISTS idx_metrics_machine ON system_metrics(machine_id);
      CREATE INDEX IF NOT EXISTS idx_logs_machine ON logs(machine_id);
      CREATE INDEX IF NOT EXISTS idx_packages_machine ON packages(machine_id);

      INSERT OR IGNORE INTO groups (id, name, description) 
      VALUES ('default', 'Default', 'Default group for ungrouped machines');
    `);
  }

  // Machine operations
  async registerMachine(machineData) {
    const id = machineData.id || uuidv4();
    const {
      hostname, os, os_version, arch, cpu_count, total_memory,
      ip_address, mac_address, group_id = 'default'
    } = machineData;

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO machines 
         (id, hostname, os, os_version, arch, cpu_count, total_memory, 
          ip_address, mac_address, group_id, status, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'online', CURRENT_TIMESTAMP)`,
        [id, hostname, os, os_version, arch, cpu_count, total_memory,
         ip_address, mac_address, group_id],
        function(err) {
          if (err) reject(err);
          else resolve({ id, ...machineData, status: 'online' });
        }
      );
    });
  }

  async updateMachineStatus(id, status) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE machines SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?',
        [status, id],
        (err) => {
          if (err) reject(err);
          else resolve({ id, status });
        }
      );
    });
  }

  async getMachines() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT m.*, g.name as group_name 
         FROM machines m 
         LEFT JOIN groups g ON m.group_id = g.id 
         ORDER BY m.last_seen DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async getMachineById(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT m.*, g.name as group_name 
         FROM machines m 
         LEFT JOIN groups g ON m.group_id = g.id 
         WHERE m.id = ?`,
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async updateMachineGroup(machineId, groupId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE machines SET group_id = ? WHERE id = ?',
        [groupId, machineId],
        (err) => {
          if (err) reject(err);
          else resolve({ machineId, groupId });
        }
      );
    });
  }

  // Group operations
  async createGroup(name, description) {
    const id = uuidv4();
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO groups (id, name, description) VALUES (?, ?, ?)',
        [id, name, description],
        (err) => {
          if (err) reject(err);
          else resolve({ id, name, description });
        }
      );
    });
  }

  async getGroups() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT g.*, COUNT(m.id) as machine_count 
         FROM groups g 
         LEFT JOIN machines m ON g.id = m.group_id 
         GROUP BY g.id 
         ORDER BY g.name`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async getMachinesByGroup(groupId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM machines WHERE group_id = ? ORDER BY hostname',
        [groupId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Command operations
  async createCommand(type, command, machineId = null, groupId = null) {
    const id = uuidv4();
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO commands (id, machine_id, group_id, type, command, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [id, machineId, groupId, type, command],
        (err) => {
          if (err) reject(err);
          else resolve({ id, type, command, machineId, groupId, status: 'pending' });
        }
      );
    });
  }

  async getPendingCommands(machineId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM commands 
         WHERE (machine_id = ? OR group_id IN (SELECT group_id FROM machines WHERE id = ?))
         AND status = 'pending'
         ORDER BY created_at`,
        [machineId, machineId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async updateCommandStatus(id, status, output = null, error = null) {
    const timestamp = status === 'executing' ? 'executed_at' : 
                      status === 'completed' || status === 'failed' ? 'completed_at' : null;
    
    let sql = 'UPDATE commands SET status = ?';
    const params = [status];

    if (output !== null) {
      sql += ', output = ?';
      params.push(output);
    }
    if (error !== null) {
      sql += ', error = ?';
      params.push(error);
    }
    if (timestamp) {
      sql += `, ${timestamp} = CURRENT_TIMESTAMP`;
    }
    sql += ' WHERE id = ?';
    params.push(id);

    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve({ id, status });
      });
    });
  }

  async getCommandHistory(machineId = null, limit = 100) {
    return new Promise((resolve, reject) => {
      let sql = `SELECT c.*, m.hostname 
                 FROM commands c 
                 LEFT JOIN machines m ON c.machine_id = m.id`;
      const params = [];
      
      if (machineId) {
        sql += ' WHERE c.machine_id = ?';
        params.push(machineId);
      }
      
      sql += ' ORDER BY c.created_at DESC LIMIT ?';
      params.push(limit);

      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Metrics operations
  async saveMetrics(machineId, metrics) {
    const {
      cpu_percent, memory_percent, memory_used, memory_total,
      disk_percent, disk_used, disk_total, network_sent, network_recv
    } = metrics;

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO system_metrics 
         (machine_id, cpu_percent, memory_percent, memory_used, memory_total,
          disk_percent, disk_used, disk_total, network_sent, network_recv)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [machineId, cpu_percent, memory_percent, memory_used, memory_total,
         disk_percent, disk_used, disk_total, network_sent, network_recv],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, machineId, metrics });
        }
      );
    });
  }

  async getMetrics(machineId, hours = 24) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM system_metrics 
         WHERE machine_id = ? 
         AND timestamp > datetime('now', '-${hours} hours')
         ORDER BY timestamp DESC`,
        [machineId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Log operations
  async saveLog(machineId, level, source, message, eventId = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO logs (machine_id, level, source, message, event_id)
         VALUES (?, ?, ?, ?, ?)`,
        [machineId, level, source, message, eventId],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }

  async getLogs(machineId = null, level = null, limit = 1000) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM logs';
      const params = [];
      const conditions = [];

      if (machineId) {
        conditions.push('machine_id = ?');
        params.push(machineId);
      }
      if (level) {
        conditions.push('level = ?');
        params.push(level);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);

      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Package operations
  async updatePackages(machineId, packages) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        this.db.run('DELETE FROM packages WHERE machine_id = ?', [machineId]);
        
        const stmt = this.db.prepare(
          'INSERT INTO packages (machine_id, name, version, installed) VALUES (?, ?, ?, ?)'
        );
        
        packages.forEach(pkg => {
          stmt.run([machineId, pkg.name, pkg.version, pkg.installed ? 1 : 0]);
        });
        
        stmt.finalize();
        this.db.run('COMMIT', (err) => {
          if (err) reject(err);
          else resolve({ machineId, packageCount: packages.length });
        });
      });
    });
  }

  async getPackages(machineId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM packages WHERE machine_id = ? ORDER BY name',
        [machineId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // File transfer operations
  async createFileTransfer(machineId, operation, sourcePath, destinationPath = null) {
    const id = uuidv4();
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO file_transfers (id, machine_id, operation, source_path, destination_path, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [id, machineId, operation, sourcePath, destinationPath],
        (err) => {
          if (err) reject(err);
          else resolve({ id, machineId, operation, sourcePath, destinationPath });
        }
      );
    });
  }

  async updateFileTransferStatus(id, status, size = null) {
    const completedAt = status === 'completed' || status === 'failed' ? 'CURRENT_TIMESTAMP' : null;
    
    let sql = 'UPDATE file_transfers SET status = ?';
    const params = [status];

    if (size !== null) {
      sql += ', size = ?';
      params.push(size);
    }
    if (completedAt) {
      sql += ', completed_at = CURRENT_TIMESTAMP';
    }
    sql += ' WHERE id = ?';
    params.push(id);

    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve({ id, status });
      });
    });
  }

  async getFileTransfers(machineId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM file_transfers WHERE machine_id = ? ORDER BY created_at DESC',
        [machineId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Cleanup
  async cleanupOldCommands(hours) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM commands 
         WHERE created_at < datetime('now', '-${hours} hours') 
         AND status IN ('completed', 'failed')`,
        [],
        function(err) {
          if (err) reject(err);
          else resolve({ deleted: this.changes });
        }
      );
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = DatabaseService;
