const express = require('express');
const router = express.Router();
const InspectionRecord = require('../models/InspectionRecord');

// 创建排查记录
router.post('/records', async (req, res) => {
  try {
    const { task_id, status, result, executed_at } = req.body;
    if (!task_id) {
      return res.status(400).json({ error: '任务ID是必需的' });
    }
    
    const newRecord = await InspectionRecord.create({ 
      task_id, 
      status: status || 'pending', 
      result, 
      executed_at: executed_at || new Date().toISOString()
    });
    res.status(201).json(newRecord);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取所有排查记录
router.get('/records', async (req, res) => {
  try {
    const records = await InspectionRecord.findAll();
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取特定排查记录
router.get('/records/:id', async (req, res) => {
  try {
    const record = await InspectionRecord.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: '排查记录未找到' });
    }
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 根据任务ID获取排查记录
router.get('/records/task/:taskId', async (req, res) => {
  try {
    const records = await InspectionRecord.findByTaskId(req.params.taskId);
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;