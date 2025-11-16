const { app } = require('../server');
const request = require('supertest');

describe('排查任务系统API测试', () => {
  // 测试创建排查任务
  it('应该能够创建新的排查任务', async () => {
    const newTask = {
      name: '测试任务',
      description: '这是一个测试任务',
      cycle: 'daily'
    };

    const response = await request(app)
      .post('/api/tasks')
      .send(newTask)
      .expect(201);

    expect(response.body.name).toBe(newTask.name);
    expect(response.body.description).toBe(newTask.description);
    expect(response.body.cycle).toBe(newTask.cycle);
  });

  // 测试获取所有排查任务
  it('应该能够获取所有排查任务', async () => {
    const response = await request(app)
      .get('/api/tasks')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  // 测试创建排查记录
  it('应该能够创建新的排查记录', async () => {
    // 先创建一个任务
    const newTask = {
      name: '记录测试任务',
      description: '用于测试记录创建',
      cycle: 'daily'
    };

    const taskResponse = await request(app)
      .post('/api/tasks')
      .send(newTask)
      .expect(201);

    // 基于创建的任务创建记录
    const newRecord = {
      task_id: taskResponse.body.id,
      status: 'completed',
      result: '测试结果'
    };

    const recordResponse = await request(app)
      .post('/api/records')
      .send(newRecord)
      .expect(201);

    expect(recordResponse.body.task_id).toBe(newRecord.task_id);
    expect(recordResponse.body.status).toBe(newRecord.status);
    expect(recordResponse.body.result).toBe(newRecord.result);
  });

  // 测试获取所有排查记录
  it('应该能够获取所有排查记录', async () => {
    const response = await request(app)
      .get('/api/records')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });
});