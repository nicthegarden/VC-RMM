const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const DatabaseService = require('./services/database');
const WebSocketManager = require('./websocket/manager');
const cron = require('node-cron');

// Load configuration
const configPath = path.join(__dirname, '../config/default.json');
let config = {};

if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Environment variables override config file
const PORT = process.env.PORT || config.port || 3000;
const HOST = process.env.HOST || config.host || '0.0.0.0';

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const db = new DatabaseService();
const wsManager = new WebSocketManager(server, db);

// Routes
app.use('/api/machines', require('./routes/machines'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/commands', require('./routes/commands'));
app.use('/api/files', require('./routes/files'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/packages', require('./routes/packages'));

// Dashboard route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Cleanup old commands every hour
cron.schedule('0 * * * *', () => {
  db.cleanupOldCommands(24);
});

server.listen(PORT, HOST, () => {
  console.log(`RMM Server running on ${HOST}:${PORT}`);
  console.log(`Dashboard available at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});

module.exports = { app, db, wsManager };
