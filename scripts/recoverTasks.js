#!/usr/bin/env node

/**
 * BullMQ 任务恢复脚本
 * 用于在 Redis 数据丢失后从数据库恢复任务
 * 支持完整恢复和差异恢复两种模式
 */

const BullMQScheduler = require('../services/BullMQScheduler');
const InspectionTask = require('../models/InspectionTask');
const logger = require('../utils/logger');

async function compareTasks() {
  const scheduler = new BullMQScheduler();
  
  try {
    console.log('开始初始化 BullMQ 调度器...');
    
    // 初始化调度器
    await scheduler.initialize();
    
    // 获取数据库中的启用任务
    const dbTasks = await InspectionTask.findAll({ 
      where: { enabled: true } 
    });
    
    // 获取队列中的重复任务
    const queueRepeatableJobs = await scheduler.queue.getRepeatableJobs();
    
    console.log(`数据库中启用的任务数量: ${dbTasks.length}`);
    console.log(`队列中重复任务数量: ${queueRepeatableJobs.length}`);
    
    // 比较数据库任务和队列任务
    const dbTaskIds = new Set(dbTasks.map(task => task.id));
    const queueTaskIds = new Set(queueRepeatableJobs.map(job => {
      // 从 job.key 中提取任务ID (格式: task-{taskId})
      return parseInt(job.key.split('-')[1]);
    }));
    
    const missingInQueue = [...dbTaskIds].filter(id => !queueTaskIds.has(id));
    const extraInQueue = [...queueTaskIds].filter(id => !dbTaskIds.has(id));
    
    console.log(`缺失的任务数量: ${missingInQueue.length}`);
    console.log(`缺失的任务ID:`, missingInQueue);
    console.log(`多余的队列任务数量: ${extraInQueue.length}`);
    
    // 检查是否需要恢复
    if (missingInQueue.length === 0) {
      console.log('队列中的任务与数据库一致，无需恢复');
      await scheduler.close();
      process.exit(0);
    }
    
    console.log('检测到任务缺失，需要执行恢复操作');
    
    // 确认是否继续恢复
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve, reject) => {
      rl.question('是否继续执行恢复操作? (y/N): ', async (answer) => {
        rl.close();
        
        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          console.log('用户取消恢复操作');
          await scheduler.close();
          process.exit(0);
        }
        
        console.log('开始恢复缺失的任务...');
        
        // 逐个恢复缺失的任务
        let recoveredCount = 0;
        for (const taskId of missingInQueue) {
          try {
            const task = dbTasks.find(t => t.id === taskId);
            if (task) {
              await scheduler.addScheduledTask(task);
              console.log(`任务 ${taskId} 恢复成功`);
              recoveredCount++;
            }
          } catch (error) {
            console.error(`恢复任务 ${taskId} 失败:`, error.message);
          }
        }
        
        console.log(`恢复完成，共恢复 ${recoveredCount} 个任务`);
        
        // 显示队列状态
        const status = await scheduler.checkQueueStatus();
        console.log('当前队列状态:');
        console.log(`  等待执行: ${status.waiting}`);
        console.log(`  正在执行: ${status.active}`);
        console.log(`  已完成: ${status.completed}`);
        console.log(`  失败: ${status.failed}`);
        console.log(`  延迟: ${status.delayed}`);
        console.log(`  重复任务: ${status.repeatable}`);
        
        // 关闭调度器
        await scheduler.close();
        console.log('调度器已关闭');
        
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('恢复过程中发生错误:', error);
    process.exit(1);
  }
}

// 执行比较和恢复
compareTasks();