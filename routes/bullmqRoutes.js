const express = require('express');
const router = express.Router();
const InspectionTask = require('../models/InspectionTask');
const BullMQScheduler = require('../services/BullMQScheduler');

// 创建新的调度器实例（仅用于BullMQ路由）
let bullMQScheduler = null;

// 初始化BullMQ调度器
async function initializeScheduler() {
  if (!bullMQScheduler) {
    bullMQScheduler = new BullMQScheduler();
    await bullMQScheduler.initialize();
  }
}

// 创建排查任务（使用BullMQ）
router.post('/tasks-bullmq', async (req, res) => {
  try {
    const { name, description, cycle } = req.body;
    if (!name || !cycle) {
      return res.status(400).json({ error: '名称和周期是必需的' });
    }
    
    // 首先创建任务
    const newTask = await InspectionTask.create({ name, description, cycle });
    
    // 初始化调度器
    await initializeScheduler();
    
    // 添加到BullMQ调度器
    await bullMQScheduler.addScheduledTask(newTask);
    
    res.status(201).json(newTask);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新排查任务（使用BullMQ）
router.put('/tasks-bullmq/:id', async (req, res) => {
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
    
    // 初始化调度器
    await initializeScheduler();
    
    // 更新BullMQ调度器中的任务
    await bullMQScheduler.updateScheduledTask(updatedTask);
    
    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除排查任务（使用BullMQ）
router.delete('/tasks-bullmq/:id', async (req, res) => {
  try {
    const task = await InspectionTask.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: '排查任务未找到' });
    }
    
    await InspectionTask.delete(req.params.id);
    
    // 初始化调度器
    await initializeScheduler();
    
    // 从BullMQ调度器中移除任务
    await bullMQScheduler.removeScheduledTask(req.params.id);
    
    res.json({ message: '排查任务已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;