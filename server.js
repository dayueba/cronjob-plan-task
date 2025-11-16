const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const taskRoutes = require('./routes/taskRoutes');
const recordRoutes = require('./routes/recordRoutes');
const bullmqRoutes = require('./routes/bullmqRoutes');
const HighAvailableScheduler = require('./services/HighAvailableScheduler');

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());

// 初始化数据库
const dbPath = path.join(__dirname, 'inspection.db');
const db = new sqlite3.Database(dbPath);

// 创建表
db.serialize(() => {
  // 创建排查任务表
  db.run(`CREATE TABLE IF NOT EXISTS inspection_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    cycle TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 创建排查记录表
  db.run(`CREATE TABLE IF NOT EXISTS inspection_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    result TEXT,
    executed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES inspection_tasks (id)
  )`);
});

// 注册路由
app.use('/api', taskRoutes);
app.use('/api', recordRoutes);
app.use('/api', bullmqRoutes);

// 健康检查端点
app.get('/health', async (req, res) => {
  try {
    // 检查数据库连接
    await new Promise((resolve, reject) => {
      db.get('SELECT 1', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    res.status(200).json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      instanceId: process.env.INSTANCE_ID || 'unknown'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 基础路由
app.get('/', (req, res) => {
  res.json({ message: '排查任务系统API' });
});

// 启动服务器
const server = app.listen(PORT, async () => {
  console.log(`服务器运行在端口 ${PORT}`);
});

// 初始化高可用任务调度器
const scheduler = new HighAvailableScheduler();
scheduler.initialize().then(() => {
  scheduler.start();
}).catch((error) => {
  console.error('调度器初始化失败:', error);
});

// 导出数据库连接供其他模块使用
module.exports = { app, db, server, scheduler };