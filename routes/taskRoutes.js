const express = require('express');
const router = express.Router();
const InspectionTask = require('../models/InspectionTask');
const { scheduler } = require('../server');

// 创建排查任务
router.post('/tasks', async (req, res) => {
  try {
    const { name, description, cycle } = req.body;
    if (!name || !cycle) {
      return res.status(400).json({ error: '名称和周期是必需的' });
    }
    
    const newTask = await InspectionTask.create({ name, description, cycle });
    
    // 添加到调度器
    if (scheduler && typeof scheduler.addTask === 'function') {
      await scheduler.addTask(newTask);
    }
    
    res.status(201).json(newTask);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取所有排查任务
router.get('/tasks', async (req, res) => {
  try {
    const tasks = await InspectionTask.findAll();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取特定排查任务
router.get('/tasks/:id', async (req, res) => {
  try {
    const task = await InspectionTask.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: '排查任务未找到' });
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新排查任务
router.put('/tasks/:id', async (req, res) => {
  try {
    const { name, description, cycle, enabled } = req.body;
    const task = await InspectionTask.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: '排查任务未找到' });
    }
    
    const updatedTask = await InspectionTask.update(req.params.id, { 
      name, 
      description, 
      cycle, 
      enabled: enabled !== undefined ? enabled : task.enabled 
    });
    
    // 更新调度器中的任务
    if (scheduler && typeof scheduler.updateTask === 'function') {
      await scheduler.updateTask(updatedTask);
    }
    
    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除排查任务
router.delete('/tasks/:id', async (req, res) => {
  try {
    const task = await InspectionTask.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: '排查任务未找到' });
    }
    
    await InspectionTask.delete(req.params.id);
    
    // 从调度器中移除任务
    if (scheduler && typeof scheduler.removeTask === 'function') {
      await scheduler.removeTask(req.params.id);
    }
    
    res.json({ message: '排查任务已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;