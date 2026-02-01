const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/database');

const db = new DatabaseService();

// GET /api/logs - Get all logs
router.get('/', async (req, res) => {
  try {
    const { machineId, level, limit } = req.query;
    const logs = await db.getLogs(
      machineId || null,
      level || null,
      parseInt(limit) || 1000
    );
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
