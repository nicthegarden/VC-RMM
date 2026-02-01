const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'RMM Agent',
  description: 'Remote Monitoring and Management Agent',
  script: path.join(__dirname, '../src/agent.js'),
  nodeOptions: ['--harmony', '--max_old_space_size=4096'],
  workingDirectory: path.join(__dirname, '..')
});

svc.on('install', () => {
  console.log('Service installed successfully');
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('Service is already installed');
});

svc.on('invalidinstallation', () => {
  console.log('Failed to install service');
});

svc.on('uninstall', () => {
  console.log('Service uninstalled successfully');
});

svc.on('start', () => {
  console.log('Service started');
});

svc.on('stop', () => {
  console.log('Service stopped');
});

svc.on('error', (err) => {
  console.error('Service error:', err);
});

// Install the service
svc.install();
