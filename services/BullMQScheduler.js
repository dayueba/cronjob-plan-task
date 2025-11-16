const { Worker, Queue, QueueEvents } = require('bullmq');
const InspectionTask = require('../models/InspectionTask');
const InspectionRecord = require('../models/InspectionRecord');
const logger = require('../utils/logger');

// Redis连接配置
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined
};

class BullMQScheduler {
  constructor() {
    this.queue = null;
    this.worker = null;
    this.queueEvents = null;
  }

  /**
   * 初始化BullMQ调度器
   */
  async initialize() {
    try {
      // 创建任务队列
      this.queue = new Queue('inspection-tasks', {
        connection: redisConnection
      });

      // 创建队列事件监听器
      this.queueEvents = new QueueEvents('inspection-tasks', {
        connection: redisConnection
      });

      // 创建工作进程
      this.worker = new Worker('inspection-tasks', this.processTask.bind(this), {
        connection: redisConnection,
        concurrency: 5 // 同时处理5个任务
      });

      // 监听工作进程事件
      this.worker.on('completed', job => {
        logger.info(`任务完成: ${job.id}`, { jobId: job.id, taskId: job.data.taskId });
      });

      this.worker.on('failed', (job, err) => {
        logger.error(`任务失败: ${job.id}`, { 
          jobId: job.id, 
          taskId: job.data.taskId, 
          error: err.message 
        });
      });

      logger.info('BullMQ调度器初始化完成');
    } catch (error) {
      logger.error('BullMQ调度器初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 处理任务
   * @param {Object} job BullMQ任务对象
   */
  async processTask(job) {
    const { taskId } = job.data;
    
    try {
      logger.info(`开始执行任务: ${taskId}`, { taskId });
      
      // 获取任务详情
      const task = await InspectionTask.findById(taskId);
      if (!task) {
        throw new Error(`任务未找到: ${taskId}`);
      }

      // 检查任务是否启用
      if (!task.enabled) {
        logger.info(`任务已禁用，跳过执行: ${taskId}`, { taskId });
        return { status: 'skipped', message: '任务已禁用' };
      }

      // 执行排查逻辑
      const result = await this.executeInspection(task);
      
      // 创建排查记录
      await InspectionRecord.create({
        task_id: taskId,
        status: 'completed',
        result: JSON.stringify(result),
        executed_at: new Date().toISOString()
      });

      logger.info(`任务执行完成: ${taskId}`, { taskId });
      return { status: 'completed', result };
    } catch (error) {
      // 记录错误
      await InspectionRecord.create({
        task_id: taskId,
        status: 'failed',
        result: `任务执行失败: ${error.message}`,
        executed_at: new Date().toISOString()
      });

      logger.error(`任务执行失败: ${taskId}`, { taskId, error: error.message });
      throw error;
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
   * 添加定时任务
   * @param {Object} task 排查任务
   */
  async addScheduledTask(task) {
    try {
      // 将任务周期转换为cron表达式
      const cronExpression = this.convertCycleToCron(task.cycle);
      
      // 添加重复任务
      const job = await this.queue.add(
        'scheduled-task',
        { taskId: task.id },
        {
          repeat: {
            pattern: cronExpression
          },
          jobId: `task-${task.id}`
        }
      );

      logger.info(`定时任务已添加: ${task.id}`, { taskId: task.id, jobId: job.id });
      return job;
    } catch (error) {
      logger.error(`添加定时任务失败: ${task.id}`, { taskId: task.id, error: error.message });
      throw error;
    }
  }

  /**
   * 移除定时任务
   * @param {number} taskId 任务ID
   */
  async removeScheduledTask(taskId) {
    try {
      await this.queue.removeRepeatableByKey(`task-${taskId}`);
      logger.info(`定时任务已移除: ${taskId}`, { taskId });
    } catch (error) {
      logger.error(`移除定时任务失败: ${taskId}`, { taskId, error: error.message });
    }
  }

  /**
   * 更新定时任务
   * @param {Object} task 排查任务
   */
  async updateScheduledTask(task) {
    try {
      // 先移除旧的任务
      await this.removeScheduledTask(task.id);
      
      // 如果任务启用，添加新的定时任务
      if (task.enabled) {
        await this.addScheduledTask(task);
      }
      
      logger.info(`定时任务已更新: ${task.id}`, { taskId: task.id });
    } catch (error) {
      logger.error(`更新定时任务失败: ${task.id}`, { taskId: task.id, error: error.message });
      throw error;
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
        return cycle;
    }
  }

  /**
   * 恢复丢失的任务
   * 当Redis中的任务数据丢失时，从数据库重新加载所有启用的任务
   */
  async recoverTasks() {
    try {
      logger.info('开始恢复任务');
      
      // 获取所有启用的任务
      const tasks = await InspectionTask.findAll({ 
        where: { enabled: true } 
      });
      
      logger.info(`找到 ${tasks.length} 个启用的任务需要恢复`);
      
      // 移除现有的重复任务（以防重复添加）
      await this.removeAllRepeatableTasks();
      
      // 逐个添加任务到队列
      for (const task of tasks) {
        try {
          await this.addScheduledTask(task);
          logger.info(`任务恢复成功: ${task.id}`, { taskId: task.id });
        } catch (error) {
          logger.error(`恢复任务失败: ${task.id}`, { 
            taskId: task.id, 
            error: error.message 
          });
        }
      }
      
      logger.info('任务恢复完成');
      return { success: true, recoveredTasks: tasks.length };
    } catch (error) {
      logger.error('任务恢复过程中发生错误', { error: error.message });
      throw error;
    }
  }

  /**
   * 移除所有重复任务
   */
  async removeAllRepeatableTasks() {
    try {
      // 获取所有重复任务
      const repeatableJobs = await this.queue.getRepeatableJobs();
      
      // 移除每个重复任务
      for (const job of repeatableJobs) {
        await this.queue.removeRepeatableByKey(job.key);
      }
      
      logger.info(`移除了 ${repeatableJobs.length} 个重复任务`);
    } catch (error) {
      logger.error('移除重复任务时发生错误', { error: error.message });
      throw error;
    }
  }

  /**
   * 检查队列状态
   */
  async checkQueueStatus() {
    try {
      // 获取队列中的各种任务数量
      const waiting = await this.queue.getWaitingCount();
      const active = await this.queue.getActiveCount();
      const completed = await this.queue.getCompletedCount();
      const failed = await this.queue.getFailedCount();
      const delayed = await this.queue.getDelayedCount();
      const repeatable = await this.queue.getRepeatableJobs();
      
      const status = {
        waiting,
        active,
        completed,
        failed,
        delayed,
        repeatable: repeatable.length,
        timestamp: new Date().toISOString()
      };
      
      logger.info('队列状态', status);
      return status;
    } catch (error) {
      logger.error('获取队列状态时发生错误', { error: error.message });
      throw error;
    }
  }

  /**
   * 关闭调度器
   */
  async close() {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
    if (this.queueEvents) {
      await this.queueEvents.close();
    }
    logger.info('BullMQ调度器已关闭');
  }
}

module.exports = BullMQScheduler;