const { WebSocketServer } = require('ws');
const url = require('url');

class WebSocketManager {
  constructor(server, db) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.db = db;
    this.clients = new Map();
    this.dashboardClients = new Set();
    
    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    console.log('WebSocket server initialized on /ws');
  }

  handleConnection(ws, req) {
    const query = url.parse(req.url, true).query;
    const clientType = query.type;
    const machineId = query.machineId;

    console.log(`New WebSocket connection: type=${clientType}, machineId=${machineId}`);

    if (clientType === 'agent' && machineId) {
      this.handleAgentConnection(ws, machineId);
    } else if (clientType === 'dashboard') {
      this.handleDashboardConnection(ws);
    } else {
      ws.close(1008, 'Invalid connection parameters');
    }
  }

  handleAgentConnection(ws, machineId) {
    this.clients.set(machineId, ws);
    this.db.updateMachineStatus(machineId, 'online');
    
    console.log(`Agent connected: ${machineId}`);
    this.broadcastToDashboards({
      type: 'agent_status',
      machineId,
      status: 'online'
    });

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        await this.handleAgentMessage(machineId, message);
      } catch (err) {
        console.error('Error handling agent message:', err);
      }
    });

    ws.on('close', () => {
      this.clients.delete(machineId);
      this.db.updateMachineStatus(machineId, 'offline');
      console.log(`Agent disconnected: ${machineId}`);
      this.broadcastToDashboards({
        type: 'agent_status',
        machineId,
        status: 'offline'
      });
    });

    ws.on('error', (err) => {
      console.error(`WebSocket error for ${machineId}:`, err);
    });

    ws.send(JSON.stringify({ type: 'connected', machineId }));
  }

  handleDashboardConnection(ws) {
    this.dashboardClients.add(ws);
    console.log('Dashboard client connected');

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        await this.handleDashboardMessage(ws, message);
      } catch (err) {
        console.error('Error handling dashboard message:', err);
      }
    });

    ws.on('close', () => {
      this.dashboardClients.delete(ws);
      console.log('Dashboard client disconnected');
    });

    ws.on('error', (err) => {
      console.error('Dashboard WebSocket error:', err);
    });

    ws.send(JSON.stringify({ type: 'connected', clientType: 'dashboard' }));
  }

  async handleAgentMessage(machineId, message) {
    switch (message.type) {
      case 'register':
        await this.db.registerMachine({
          id: machineId,
          ...message.data
        });
        this.broadcastToDashboards({
          type: 'machine_registered',
          machineId,
          data: message.data
        });
        break;

      case 'metrics':
        await this.db.saveMetrics(machineId, message.data);
        this.broadcastToDashboards({
          type: 'metrics_update',
          machineId,
          data: message.data
        });
        break;

      case 'command_result':
        await this.db.updateCommandStatus(
          message.commandId,
          message.status,
          message.output,
          message.error
        );
        this.broadcastToDashboards({
          type: 'command_result',
          commandId: message.commandId,
          machineId,
          status: message.status,
          output: message.output,
          error: message.error
        });
        break;

      case 'logs':
        for (const log of message.data) {
          await this.db.saveLog(
            machineId,
            log.level,
            log.source,
            log.message,
            log.event_id
          );
        }
        this.broadcastToDashboards({
          type: 'logs_update',
          machineId,
          count: message.data.length
        });
        break;

      case 'packages':
        await this.db.updatePackages(machineId, message.data);
        this.broadcastToDashboards({
          type: 'packages_update',
          machineId,
          count: message.data.length
        });
        break;

      case 'file_listing':
        this.broadcastToDashboards({
          type: 'file_listing',
          machineId,
          path: message.path,
          files: message.files,
          error: message.error
        });
        break;

      case 'file_content':
        this.broadcastToDashboards({
          type: 'file_content',
          machineId,
          path: message.path,
          content: message.content,
          error: message.error
        });
        break;

      case 'shell_output':
        this.broadcastToDashboards({
          type: 'shell_output',
          machineId,
          sessionId: message.sessionId,
          output: message.output,
          isError: message.isError,
          isComplete: message.isComplete
        });
        break;

      case 'heartbeat':
        this.db.updateMachineStatus(machineId, 'online');
        break;

      default:
        console.log(`Unknown message type from ${machineId}:`, message.type);
    }
  }

  async handleDashboardMessage(ws, message) {
    switch (message.type) {
      case 'execute_command':
        const command = await this.db.createCommand(
          message.commandType,
          message.command,
          message.machineId,
          message.groupId
        );
        
        if (message.machineId && this.clients.has(message.machineId)) {
          this.clients.get(message.machineId).send(JSON.stringify({
            type: 'execute_command',
            commandId: command.id,
            commandType: message.commandType,
            command: message.command
          }));
        } else if (message.groupId) {
          const machines = await this.db.getMachinesByGroup(message.groupId);
          machines.forEach(m => {
            if (this.clients.has(m.id)) {
              this.clients.get(m.id).send(JSON.stringify({
                type: 'execute_command',
                commandId: command.id,
                commandType: message.commandType,
                command: message.command
              }));
            }
          });
        }

        ws.send(JSON.stringify({
          type: 'command_created',
          commandId: command.id
        }));
        break;

      case 'get_file_listing':
        if (this.clients.has(message.machineId)) {
          this.clients.get(message.machineId).send(JSON.stringify({
            type: 'get_file_listing',
            requestId: message.requestId,
            path: message.path
          }));
        }
        break;

      case 'get_file_content':
        if (this.clients.has(message.machineId)) {
          this.clients.get(message.machineId).send(JSON.stringify({
            type: 'get_file_content',
            requestId: message.requestId,
            path: message.path
          }));
        }
        break;

      case 'shell_input':
        if (this.clients.has(message.machineId)) {
          this.clients.get(message.machineId).send(JSON.stringify({
            type: 'shell_input',
            sessionId: message.sessionId,
            input: message.input
          }));
        }
        break;

      case 'close_shell':
        if (this.clients.has(message.machineId)) {
          this.clients.get(message.machineId).send(JSON.stringify({
            type: 'close_shell',
            sessionId: message.sessionId
          }));
        }
        break;

      case 'request_metrics':
        if (this.clients.has(message.machineId)) {
          this.clients.get(message.machineId).send(JSON.stringify({
            type: 'request_metrics'
          }));
        }
        break;

      case 'request_logs':
        if (this.clients.has(message.machineId)) {
          this.clients.get(message.machineId).send(JSON.stringify({
            type: 'request_logs',
            hours: message.hours || 24
          }));
        }
        break;

      case 'request_packages':
        if (this.clients.has(message.machineId)) {
          this.clients.get(message.machineId).send(JSON.stringify({
            type: 'request_packages'
          }));
        }
        break;

      default:
        console.log('Unknown dashboard message type:', message.type);
    }
  }

  broadcastToDashboards(message) {
    const data = JSON.stringify(message);
    this.dashboardClients.forEach(client => {
      if (client.readyState === 1) {
        client.send(data);
      }
    });
  }

  sendToMachine(machineId, message) {
    if (this.clients.has(machineId)) {
      this.clients.get(machineId).send(JSON.stringify(message));
      return true;
    }
    return false;
  }
}

module.exports = WebSocketManager;
