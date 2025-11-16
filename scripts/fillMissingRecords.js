#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const logger = require('../utils/logger');

// 解析命令行参数
program
  .option('--start-date <date>', '开始日期 (YYYY-MM-DD)')
  .option('--end-date <date>', '结束日期 (YYYY-MM-DD)')
  .option('--task-id <id>', '特定任务ID')
  .option('--task-name <name>', '特定任务名称')
  .option('--status <status>', '补充记录的状态', '补录')
  .option('--result <result>', '补充记录的结果', '由补录脚本生成')
  .option('--dry-run', '仅显示将要补充的记录，不实际执行')
  .parse();

const options = program.opts();

// 验证必需参数
if (!options.startDate || !options.endDate) {
  console.error('错误: 必须提供开始日期和结束日期');
  program.help();
}

// 验证日期格式
function isValidDate(dateString) {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date) && dateString === date.toISOString().split('T')[0];
}

if (!isValidDate(options.startDate) || !isValidDate(options.endDate)) {
  console.error('错误: 日期格式无效，请使用 YYYY-MM-DD 格式');
  process.exit(1);
}

// 打开数据库连接
const dbPath = path.join(__dirname, '..', 'inspection.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('无法连接到数据库:', err.message);
    process.exit(1);
  }
  logger.info('数据库连接成功');
});

// 主函数
async function fillMissingRecords() {
  try {
    logger.info('开始补充缺失的记录', {
      startDate: options.startDate,
      endDate: options.endDate,
      taskId: options.taskId,
      taskName: options.taskName,
      dryRun: options.dryRun
    });

    // 获取符合条件的排查任务
    let tasksQuery = 'SELECT * FROM inspection_tasks WHERE enabled = 1';
    const tasksParams = [];

    if (options.taskId) {
      tasksQuery += ' AND id = ?';
      tasksParams.push(options.taskId);
    }

    if (options.taskName) {
      tasksQuery += ' AND name LIKE ?';
      tasksParams.push(`%${options.taskName}%`);
    }

    const tasks = await new Promise((resolve, reject) => {
      db.all(tasksQuery, tasksParams, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    if (tasks.length === 0) {
      logger.info('未找到符合条件的排查任务');
      return;
    }

    logger.info(`找到 ${tasks.length} 个符合条件的排查任务`, { taskIds: tasks.map(t => t.id) });

    // 遍历每个任务，补充缺失的记录
    for (const task of tasks) {
      await fillMissingRecordsForTask(task);
    }

    logger.info('补充缺失记录完成');
  } catch (error) {
    logger.error('补充缺失记录时发生错误', { error: error.message });
    process.exit(1);
  } finally {
    // 关闭数据库连接
    db.close((err) => {
      if (err) {
        console.error('关闭数据库连接时发生错误:', err.message);
      } else {
        logger.info('数据库连接已关闭');
      }
    });
  }
}

// 为特定任务补充缺失的记录
async function fillMissingRecordsForTask(task) {
  logger.info(`开始处理任务: ${task.name} (${task.id})`, { taskId: task.id });

  // 计算任务在指定时间范围内应该生成的记录时间点
  const expectedDates = calculateExpectedDates(task.cycle, options.startDate, options.endDate);
  
  // 获取任务在指定时间范围内的实际记录
  const recordsQuery = `
    SELECT DATE(executed_at) as date FROM inspection_records 
    WHERE task_id = ? AND executed_at >= ? AND executed_at <= ?
  `;
  const recordsParams = [task.id, `${options.startDate} 00:00:00`, `${options.endDate} 23:59:59`];

  const existingRecords = await new Promise((resolve, reject) => {
    db.all(recordsQuery, recordsParams, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows.map(r => r.date));
      }
    });
  });

  // 计算缺失的日期
  const missingDates = expectedDates.filter(date => !existingRecords.includes(date));
  
  logger.info(`任务 ${task.id} 缺失 ${missingDates.length} 条记录`, { 
    taskId: task.id, 
    missingDates 
  });

  if (missingDates.length === 0) {
    logger.info(`任务 ${task.id} 在指定时间范围内没有缺失的记录`);
    return;
  }

  // 生成缺失的记录
  for (const missingDate of missingDates) {
    const recordToInsert = {
      task_id: task.id,
      status: options.status,
      result: options.result,
      executed_at: `${missingDate} 00:00:00`
    };

    if (options.dryRun) {
      logger.info('DRY RUN - 将要创建记录', recordToInsert);
    } else {
      // 插入缺失的记录
      const insertQuery = `
        INSERT INTO inspection_records (task_id, status, result, executed_at, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      const insertParams = [
        recordToInsert.task_id,
        recordToInsert.status,
        recordToInsert.result,
        recordToInsert.executed_at
      ];

      await new Promise((resolve, reject) => {
        db.run(insertQuery, insertParams, function(err) {
          if (err) {
            logger.error(`插入记录失败: ${recordToInsert.executed_at}`, { 
              taskId: task.id, 
              error: err.message 
            });
            reject(err);
          } else {
            logger.info(`记录创建成功: ${recordToInsert.executed_at}`, { 
              taskId: task.id, 
              recordId: this.lastID 
            });
            resolve();
          }
        });
      });
    }
  }
}

// 根据任务周期和时间范围计算预期的执行日期
function calculateExpectedDates(cycle, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates = [];

  // 将时间调整到一天的开始
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  let currentDate = new Date(start);

  switch (cycle.toLowerCase()) {
    case 'hourly':
      while (currentDate <= end) {
        // 每小时生成一次，但为了简化，我们按天处理
        // 在实际使用中，可以生成每小时的记录
        dates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      break;
      
    case 'daily':
      while (currentDate <= end) {
        dates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      break;
      
    case 'weekly':
      // 找到开始日期所在周的第一个星期日
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - currentDate.getDay()); // 0是星期日
      
      while (startOfWeek <= end) {
        const dateStr = startOfWeek.toISOString().split('T')[0];
        dates.push(dateStr);
        
        startOfWeek.setDate(startOfWeek.getDate() + 7); // 下一周
      }
      break;
      
    case 'monthly':
      // 找到开始月份的第一天
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      
      while (startOfMonth <= end) {
        const dateStr = startOfMonth.toISOString().split('T')[0];
        dates.push(dateStr);
        
        startOfMonth.setMonth(startOfMonth.getMonth() + 1); // 下一个月
      }
      break;
      
    default:
      // 如果是自定义的cron表达式，我们简化处理，按天生成
      while (currentDate <= end) {
        dates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      break;
  }

  return dates;
}

// 执行主函数
fillMissingRecords().catch(error => {
  logger.error('执行补充记录脚本时发生错误', { error: error.message });
  process.exit(1);
});