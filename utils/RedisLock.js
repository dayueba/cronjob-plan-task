const redis = require('redis');

class RedisLock {
  constructor(redisClient) {
    this.client = redisClient;
  }

  /**
   * 获取分布式锁
   * @param {string} lockKey 锁的键名
   * @param {number} lockTimeout 锁的超时时间（毫秒）
   * @returns {Promise<boolean>} 是否成功获取锁
   */
  async acquireLock(lockKey, lockTimeout = 30000) {
    try {
      const result = await this.client.set(lockKey, 'locked', {
        PX: lockTimeout,
        NX: true
      });
      return result === 'OK';
    } catch (error) {
      console.error('获取锁失败:', error);
      return false;
    }
  }

  /**
   * 释放分布式锁
   * @param {string} lockKey 锁的键名
   * @returns {Promise<void>}
   */
  async releaseLock(lockKey) {
    try {
      await this.client.del(lockKey);
    } catch (error) {
      console.error('释放锁失败:', error);
    }
  }

  /**
   * 延长锁的过期时间
   * @param {string} lockKey 锁的键名
   * @param {number} extendTime 延长时间（毫秒）
   * @returns {Promise<boolean>} 是否成功延长
   */
  async extendLock(lockKey, extendTime) {
    try {
      const script = `
        if redis.call("get", KEYS[1]) == "locked" then
          return redis.call("pexpire", KEYS[1], ARGV[1])
        else
          return 0
        end
      `;
      const result = await this.client.eval(script, {
        keys: [lockKey],
        arguments: [extendTime]
      });
      return result === 1;
    } catch (error) {
      console.error('延长锁失败:', error);
      return false;
    }
  }
}

module.exports = RedisLock;