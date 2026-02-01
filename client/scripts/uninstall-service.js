const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'RMM Agent',
  script: path.join(__dirname, '../src/agent.js')
});

svc.on('uninstall', () => {
  console.log('Service uninstalled successfully');
});

svc.on('error', (err) => {
  console.error('Service error:', err);
});

// Uninstall the service
svc.uninstall();
