const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/database');

const db = new DatabaseService();

// GET /api/groups - List all groups
router.get('/', async (req, res) => {
  try {
    const groups = await db.getGroups();
    res.json({ success: true, data: groups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/groups - Create new group
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Group name required' });
    }
    const group = await db.createGroup(name, description);
    res.status(201).json({ success: true, data: group });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/groups/:id/machines - Get machines in group
router.get('/:id/machines', async (req, res) => {
  try {
    const machines = await db.getMachinesByGroup(req.params.id);
    res.json({ success: true, data: machines });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/groups/:id - Update group
router.put('/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    await db.db.run(
      'UPDATE groups SET name = ?, description = ? WHERE id = ?',
      [name, description, req.params.id]
    );
    res.json({ success: true, data: { id: req.params.id, name, description } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/groups/:id - Delete group
router.delete('/:id', async (req, res) => {
  try {
    await db.db.run('BEGIN TRANSACTION');
    await db.db.run(
      "UPDATE machines SET group_id = 'default' WHERE group_id = ?",
      [req.params.id]
    );
    await db.db.run('DELETE FROM groups WHERE id = ?', [req.params.id]);
    await db.db.run('COMMIT');
    res.json({ success: true, message: 'Group deleted' });
  } catch (err) {
    await db.db.run('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
