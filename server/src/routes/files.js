const express = require('express');
const router = express.Router();
const path = require('path');

// POST /api/files/upload - Upload file to machine
router.post('/upload', async (req, res) => {
  try {
    const { machineId, destinationPath, content } = req.body;
    
    if (!machineId || !destinationPath || !content) {
      return res.status(400).json({
        success: false,
        error: 'machineId, destinationPath, and content required'
      });
    }

    const { wsManager } = require('../app');
    const success = wsManager.sendToMachine(machineId, {
      type: 'upload_file',
      destinationPath,
      content
    });

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Machine not connected'
      });
    }

    res.json({ success: true, message: 'File upload requested' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/files/download - Request file download from machine
router.post('/download', async (req, res) => {
  try {
    const { machineId, sourcePath } = req.body;
    
    if (!machineId || !sourcePath) {
      return res.status(400).json({
        success: false,
        error: 'machineId and sourcePath required'
      });
    }

    const { wsManager } = require('../app');
    const success = wsManager.sendToMachine(machineId, {
      type: 'download_file',
      sourcePath
    });

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Machine not connected'
      });
    }

    res.json({ success: true, message: 'File download requested' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
