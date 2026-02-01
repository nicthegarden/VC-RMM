const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/database');

const db = new DatabaseService();

// GET /api/packages - Get all packages
router.get('/', async (req, res) => {
  try {
    const { machineId } = req.query;
    if (machineId) {
      const packages = await db.getPackages(machineId);
      res.json({ success: true, data: packages });
    } else {
      const packages = await new Promise((resolve, reject) => {
        db.db.all(
          `SELECT p.*, m.hostname 
           FROM packages p 
           JOIN machines m ON p.machine_id = m.id 
           ORDER BY p.name`,
          [],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });
      res.json({ success: true, data: packages });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/packages/install - Install package on machine
router.post('/install', async (req, res) => {
  try {
    const { machineId, packageName } = req.body;
    
    if (!machineId || !packageName) {
      return res.status(400).json({
        success: false,
        error: 'machineId and packageName required'
      });
    }

    const { wsManager } = require('../app');
    const success = wsManager.sendToMachine(machineId, {
      type: 'install_package',
      packageName
    });

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Machine not connected'
      });
    }

    res.json({ success: true, message: `Package installation requested: ${packageName}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/packages/uninstall - Uninstall package from machine
router.post('/uninstall', async (req, res) => {
  try {
    const { machineId, packageName } = req.body;
    
    if (!machineId || !packageName) {
      return res.status(400).json({
        success: false,
        error: 'machineId and packageName required'
      });
    }

    const { wsManager } = require('../app');
    const success = wsManager.sendToMachine(machineId, {
      type: 'uninstall_package',
      packageName
    });

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Machine not connected'
      });
    }

    res.json({ success: true, message: `Package uninstallation requested: ${packageName}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/packages/update - Update all packages on machine
router.post('/update', async (req, res) => {
  try {
    const { machineId } = req.body;
    
    if (!machineId) {
      return res.status(400).json({
        success: false,
        error: 'machineId required'
      });
    }

    const { wsManager } = require('../app');
    const success = wsManager.sendToMachine(machineId, {
      type: 'update_packages'
    });

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Machine not connected'
      });
    }

    res.json({ success: true, message: 'Package update requested' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
