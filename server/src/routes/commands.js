const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/database');

const db = new DatabaseService();

// GET /api/commands - Get command history
router.get('/', async (req, res) => {
  try {
    const { machineId, limit } = req.query;
    const commands = await db.getCommandHistory(
      machineId || null,
      parseInt(limit) || 100
    );
    res.json({ success: true, data: commands });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/commands - Create new command
router.post('/', async (req, res) => {
  try {
    const { type, command, machineId, groupId } = req.body;
    
    if (!type || !command) {
      return res.status(400).json({
        success: false,
        error: 'Command type and command required'
      });
    }

    if (!machineId && !groupId) {
      return res.status(400).json({
        success: false,
        error: 'Either machineId or groupId required'
      });
    }

    const cmd = await db.createCommand(type, command, machineId, groupId);
    res.status(201).json({ success: true, data: cmd });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/commands/:id - Get command details
router.get('/:id', async (req, res) => {
  try {
    const command = await new Promise((resolve, reject) => {
      db.db.get(
        `SELECT c.*, m.hostname 
         FROM commands c 
         LEFT JOIN machines m ON c.machine_id = m.id 
         WHERE c.id = ?`,
        [req.params.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!command) {
      return res.status(404).json({ success: false, error: 'Command not found' });
    }

    res.json({ success: true, data: command });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
