const { Redis } = require('ioredis');

// Check if Redis is configured
const redisUrl = process.env.REDIS_URL;

// Mock cache for when Redis is not available
class MockCache {
  async get(key) { return null; }
  async set(key, value, ttl) { return true; }
  async del(key) { return true; }
  async keys(pattern) { return []; }
}

let redis;
try {
  if (redisUrl && redisUrl !== 'production') {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null
    });
    console.log('✅ Redis: Connected');
  } else {
    console.log('⚠️ Redis: Not configured, using mock cache');
    redis = new MockCache();
  }
} catch (error) {
  console.log('⚠️ Redis: Connection failed, using mock cache');
  redis = new MockCache();
}

module.exports = {
  cache: redis
};