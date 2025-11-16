const cron = require('node-cron');
const InspectionTask = require('../models/InspectionTask');
const InspectionRecord = require('../models/InspectionRecord');
const RedisLock = require('../utils/RedisLock');
const { createClient } = require('redis');
const logger = require('../utils/logger');

class HighAvailableScheduler {
  constructor() {
    this.tasks = new Map();
    this.redisClient = null;
    this.lock = null;
    this.instanceId = `instance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 初始化调度器
   */
  async initialize() {
    try {
      // 创建Redis客户端
      this.redisClient = createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined
      });

      // 连接Redis
      await this.redisClient.connect();
      
      // 创建分布式锁实例
      this.lock = new RedisLock(this.redisClient);
      
      logger.info('高可用调度器初始化完成', { instanceId: this.instanceId });
    } catch (error) {
      logger.error('高可用调度器初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 启动调度器
   */
  async start() {
    try {
      await this.loadTasks();
      await this.scheduleTasks();
      logger.info('高可用调度器启动完成', { instanceId: this.instanceId });
    } catch (error) {
      logger.error('高可用调度器启动失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 从数据库加载任务
   */
  async loadTasks() {
    try {
      const tasks = await InspectionTask.findAll();
      for (const task of tasks) {
        if (task.enabled) {
          this.tasks.set(task.id, task);
        }
      }
      logger.info('任务加载完成', { taskCount: this.tasks.size });
    } catch (error) {
      logger.error('加载任务失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 调度所有任务
   */
  async scheduleTasks() {
    for (const [taskId, task] of this.tasks) {
      await this.scheduleTask(task);
    }
    logger.info('任务调度完成', { taskCount: this.tasks.size });
  }

  /**
   * 调度单个任务
   * @param {Object} task 任务对象
   */
  async scheduleTask(task) {
    // 将任务周期转换为cron表达式
    const cronExpression = this.convertCycleToCron(task.cycle);
    
    // 取消已存在的任务调度
    if (this.tasks.has(task.id)) {
      await this.cancelTask(task.id);
    }
    
    // 调度新任务
    const scheduledTask = cron.schedule(cronExpression, async () => {
      await this.executeTask(task);
    }, {
      timezone: 'Asia/Shanghai'
    });
    
    // 添加到任务映射中
    this.tasks.set(task.id, { ...task, scheduledTask });
    
    logger.info('任务调度成功', { 
      taskId: task.id, 
      taskName: task.name, 
      cronExpression 
    });
  }

  /**
   * 执行任务
   * @param {Object} task 任务对象
   */
  async executeTask(task) {
    const lockKey = `task_lock:${task.id}`;
    const timeout = 30000; // 30秒锁超时
    
    try {
      // 获取分布式锁
      const acquired = await this.lock.acquireLock(lockKey, timeout);
      if (!acquired) {
        logger.info('任务已在其他实例上执行，跳过', { 
          taskId: task.id, 
          instanceId: this.instanceId 
        });
        return;
      }

      logger.info('开始执行任务', { 
        taskId: task.id, 
        taskName: task.name, 
        instanceId: this.instanceId 
      });

      // 检查任务是否仍然启用
      const currentTask = await InspectionTask.findById(task.id);
      if (!currentTask || !currentTask.enabled) {
        logger.info('任务已禁用，跳过执行', { taskId: task.id });
        return;
      }

      // 延长锁的时间，以防任务执行时间较长
      const extendInterval = setInterval(async () => {
        await this.lock.extendLock(lockKey, timeout);
      }, timeout / 2);

      try {
        // 执行排查逻辑
        const result = await this.executeInspection(currentTask);

        // 创建排查记录
        await InspectionRecord.create({
          task_id: currentTask.id,
          status: 'completed',
          result: JSON.stringify(result),
          executed_at: new Date().toISOString()
        });

        logger.info('任务执行完成', { 
          taskId: currentTask.id, 
          instanceId: this.instanceId 
        });
      } finally {
        clearInterval(extendInterval);
      }
    } catch (error) {
      logger.error('执行任务时发生错误', { 
        taskId: task.id, 
        instanceId: this.instanceId, 
        error: error.message 
      });
      
      // 记录错误
      await InspectionRecord.create({
        task_id: task.id,
        status: 'failed',
        result: `任务执行失败: ${error.message}`,
        executed_at: new Date().toISOString()
      });
    } finally {
      // 释放锁
      await this.lock.releaseLock(lockKey);
    }
  }

  /**
   * 执行具体的排查逻辑
   * @param {Object} task 任务对象
   */
  async executeInspection(task) {
    // 这里实现具体的排查逻辑
    // 作为示例，我们返回一个简单的结果
    return {
      taskId: task.id,
      taskName: task.name,
      executedAt: new Date().toISOString(),
      result: '排查完成'
    };
  }

  /**
   * 取消任务调度
   * @param {number} taskId 任务ID
   */
  async cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (task && task.scheduledTask) {
      task.scheduledTask.destroy();
      this.tasks.delete(taskId);
      
      logger.info('任务调度已取消', { taskId });
    }
  }

  /**
   * 将周期转换为cron表达式
   * @param {string} cycle 周期
   */
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

  /**
   * 检查是否是有效的cron表达式
   * @param {string} expression 表达式
   */
  isValidCronExpression(expression) {
    try {
      cron.validate(expression);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 添加新任务到调度器
   * @param {Object} task 任务对象
   */
  async addTask(task) {
    if (task.enabled) {
      this.tasks.set(task.id, task);
      await this.scheduleTask(task);
    }
  }

  /**
   * 从调度器移除任务
   * @param {number} taskId 任务ID
   */
  async removeTask(taskId) {
    await this.cancelTask(taskId);
    this.tasks.delete(taskId);
  }

  /**
   * 更新调度任务
   * @param {Object} updatedTask 更新后的任务对象
   */
  async updateTask(updatedTask) {
    // 如果任务被禁用，取消调度
    if (!updatedTask.enabled) {
      await this.cancelTask(updatedTask.id);
      return;
    }
    
    // 否则更新调度
    await this.cancelTask(updatedTask.id);
    await this.addTask(updatedTask);
  }

  /**
   * 关闭调度器
   */
  async close() {
    // 取消所有任务
    for (const [taskId] of this.tasks) {
      await this.cancelTask(taskId);
    }
    
    // 关闭Redis连接
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    
    logger.info('高可用调度器已关闭', { instanceId: this.instanceId });
  }
}

module.exports = HighAvailableScheduler;