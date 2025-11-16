# BullMQ 调度系统恢复手册

## 概述

本手册提供了在 Redis 数据丢失情况下恢复 BullMQ 调度系统的详细步骤。当 Redis 中的任务数据丢失时，可通过本手册指导的步骤从数据库重建任务队列。

## 恢复场景

- Redis 服务意外宕机导致数据丢失
- Redis 持久化配置不当导致重启后数据丢失
- Redis 数据损坏无法正常访问
- 任何导致 BullMQ 队列中任务数据丢失的情况

## 恢复函数说明

### 1. recoverTasks() - 任务恢复函数

此函数负责从数据库重新加载所有启用的任务到 BullMQ 队列中：

```javascript
const result = await scheduler.recoverTasks();
// 返回: { success: true, recoveredTasks: 恢复的任务数量 }
```

**功能：**
- 从数据库查询所有启用的任务
- 移除现有的重复任务（避免重复添加）
- 逐个将任务添加回 BullMQ 队列
- 记录恢复过程的日志

### 2. checkQueueStatus() - 队列状态检查

此函数用于检查当前队列的状态：

```javascript
const status = await scheduler.checkQueueStatus();
// 返回队列中各种状态的任务数量
```

**返回信息：**
- waiting: 等待执行的任务数量
- active: 正在执行的任务数量
- completed: 已完成的任务数量
- failed: 失败的任务数量
- delayed: 延迟执行的任务数量
- repeatable: 重复任务的数量

### 3. removeAllRepeatableTasks() - 移除所有重复任务

此函数用于清理队列中的所有重复任务。

## 恢复步骤

### 第一步：确认数据丢失

1. 检查 Redis 服务状态
2. 验证队列状态：

```javascript
const status = await scheduler.checkQueueStatus();
console.log('当前队列状态:', status);
```

3. 如果 repeatable 任务数量为 0，可能表示重复任务已丢失

### 第二步：停止当前调度器（可选）

如果系统仍在运行，建议先停止调度器：

```javascript
await scheduler.close(); // 关闭当前调度器实例
```

### 第三步：重新初始化调度器

```javascript
// 重新初始化调度器
await scheduler.initialize();
```

### 第四步：执行恢复操作

```javascript
try {
  const result = await scheduler.recoverTasks();
  console.log(`恢复完成，共恢复 ${result.recoveredTasks} 个任务`);
} catch (error) {
  console.error('恢复过程中发生错误:', error);
}
```

### 第五步：验证恢复结果

1. 检查队列状态：

```javascript
const status = await scheduler.checkQueueStatus();
console.log('恢复后的队列状态:', status);
```

2. 确认 repeatable 任务数量与预期一致
3. 检查日志确认恢复过程无错误

## 预防措施

### 1. Redis 配置优化

- 启用 AOF 持久化：在 redis.conf 中设置 `appendfsync always`
- 配置 RDB 快照：设置合理的 `save` 参数
- 启用主从复制或使用 Redis Cluster 提高可用性

### 2. 监控告警

- 监控 Redis 内存使用情况
- 设置 Redis 服务可用性告警
- 监控 BullMQ 队列状态，及时发现任务丢失

### 3. 定期备份

- 定期备份 Redis 数据
- 定期备份数据库中的任务配置

### 4. 健康检查

在应用启动时添加健康检查：

```javascript
async function healthCheck() {
  const status = await scheduler.checkQueueStatus();
  const tasksInDB = await InspectionTask.count({ where: { enabled: true } });
  
  if (status.repeatable === 0 && tasksInDB > 0) {
    console.warn('检测到任务数据可能已丢失，建议执行恢复操作');
  }
}
```

## 常见问题

### 问题1：恢复过程中出现重复任务错误

**解决方案：** 确保在恢复前调用 `removeAllRepeatableTasks()` 清理现有任务

### 问题2：数据库中任务数量与恢复数量不一致

**可能原因：**
- 某些任务配置错误
- 任务周期表达式无效
- 权限问题

**解决方案：** 检查日志中的错误信息，逐一排查问题任务

### 问题3：恢复后任务未按预期执行

**检查项：**
- 确认 Redis 服务正常运行
- 检查工作进程是否正常启动
- 验证 cron 表达式是否正确

## API 路由支持

系统提供了 REST API 接口用于远程执行恢复操作：

```
POST /api/bullmq/recover
GET  /api/bullmq/status
```

## 注意事项

1. 恢复操作可能会在短时间内创建大量队列任务，请确保系统资源充足
2. 恢复过程中，已过期但未执行的任务会立即被调度执行
3. 建议在业务低峰期执行恢复操作
4. 恢复操作不会影响正在执行的任务（这些任务的状态已丢失）
5. 恢复操作会覆盖现有的重复任务配置