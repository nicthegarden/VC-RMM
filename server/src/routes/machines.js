const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/database');

const db = new DatabaseService();

// GET /api/machines - List all machines
router.get('/', async (req, res) => {
  try {
    const machines = await db.getMachines();
    res.json({ success: true, data: machines });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/machines/:id - Get machine details
router.get('/:id', async (req, res) => {
  try {
    const machine = await db.getMachineById(req.params.id);
    if (!machine) {
      return res.status(404).json({ success: false, error: 'Machine not found' });
    }
    res.json({ success: true, data: machine });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/machines/:id/group - Update machine group
router.put('/:id/group', async (req, res) => {
  try {
    const { groupId } = req.body;
    if (!groupId) {
      return res.status(400).json({ success: false, error: 'Group ID required' });
    }
    await db.updateMachineGroup(req.params.id, groupId);
    res.json({ success: true, data: { machineId: req.params.id, groupId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/machines/:id/metrics - Get machine metrics
router.get('/:id/metrics', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const metrics = await db.getMetrics(req.params.id, hours);
    res.json({ success: true, data: metrics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/machines/:id/logs - Get machine logs
router.get('/:id/logs', async (req, res) => {
  try {
    const { level, limit } = req.query;
    const logs = await db.getLogs(req.params.id, level, parseInt(limit) || 1000);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/machines/:id/packages - Get machine packages
router.get('/:id/packages', async (req, res) => {
  try {
    const packages = await db.getPackages(req.params.id);
    res.json({ success: true, data: packages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/machines/:id/commands - Get command history
router.get('/:id/commands', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const commands = await db.getCommandHistory(req.params.id, limit);
    res.json({ success: true, data: commands });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/machines/:id - Remove machine
router.delete('/:id', async (req, res) => {
  try {
    await db.db.run('DELETE FROM machines WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Machine removed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
