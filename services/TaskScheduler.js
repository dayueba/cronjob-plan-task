const cron = require('node-cron');
const InspectionTask = require('../models/InspectionTask');
const InspectionRecord = require('../models/InspectionRecord');

class TaskScheduler {
  constructor() {
    this.tasks = new Map();
  }

  // 启动调度器
  start() {
    this.loadTasks();
    this.scheduleTasks();
  }

  // 从数据库加载任务
  async loadTasks() {
    try {
      const tasks = await InspectionTask.findAll();
      for (const task of tasks) {
        if (task.enabled) {
          this.tasks.set(task.id, task);
        }
      }
    } catch (error) {
      console.error('加载任务失败:', error);
    }
  }

  // 调度任务
  scheduleTasks() {
    // 遍历所有启用的任务并调度
    for (const [taskId, task] of this.tasks) {
      this.scheduleTask(task);
    }
  }

  // 调度单个任务
  scheduleTask(task) {
    // 将任务周期转换为cron表达式
    const cronExpression = this.convertCycleToCron(task.cycle);
    
    // 取消已存在的任务调度
    if (this.tasks.has(task.id)) {
      this.cancelTask(task.id);
    }
    
    // 调度新任务
    const scheduledTask = cron.schedule(cronExpression, async () => {
      try {
        console.log(`执行任务: ${task.name} (${task.id})`);
        
        // 创建新的排查记录
        await InspectionRecord.create({
          task_id: task.id,
          status: 'completed',
          result: '任务执行成功',
          executed_at: new Date().toISOString()
        });
        
        console.log(`任务 ${task.name} 执行完成`);
      } catch (error) {
        console.error(`执行任务 ${task.name} 时出错:`, error);
        
        // 记录错误
        await InspectionRecord.create({
          task_id: task.id,
          status: 'failed',
          result: `任务执行失败: ${error.message}`,
          executed_at: new Date().toISOString()
        });
      }
    });
    
    // 添加到任务映射中
    this.tasks.set(task.id, { ...task, scheduledTask });
  }

  // 取消任务调度
  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (task && task.scheduledTask) {
      task.scheduledTask.destroy();
      this.tasks.delete(taskId);
    }
  }

  // 将周期转换为cron表达式
  convertCycleToCron(cycle) {
    switch (cycle.toLowerCase()) {
      case 'hourly':
        return '0 * * * *'; // 每小时
      case 'daily':
        return '0 0 * * *'; // 每天午夜
      case 'weekly':
        return '0 0 * * 0'; // 每周日凌晨
      case 'monthly':
        return '0 0 1 * *'; // 每月1号
      default:
        // 如果是有效的cron表达式，直接返回
        if (this.isValidCronExpression(cycle)) {
          return cycle;
        }
        // 默认每天执行
        return '0 0 * * *';
    }
  }

  // 检查是否是有效的cron表达式
  isValidCronExpression(expression) {
    try {
      cron.validate(expression);
      return true;
    } catch (error) {
      return false;
    }
  }

  // 添加新任务到调度器
  async addTask(task) {
    if (task.enabled) {
      this.tasks.set(task.id, task);
      this.scheduleTask(task);
    }
  }

  // 从调度器移除任务
  removeTask(taskId) {
    this.cancelTask(taskId);
    this.tasks.delete(taskId);
  }

  // 更新调度任务
  async updateTask(updatedTask) {
    // 如果任务被禁用，取消调度
    if (!updatedTask.enabled) {
      this.cancelTask(updatedTask.id);
      return;
    }
    
    // 否则更新调度
    this.cancelTask(updatedTask.id);
    this.addTask(updatedTask);
  }
}

module.exports = TaskScheduler;