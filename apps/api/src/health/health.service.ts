import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(private readonly redisService: RedisService) {}

  async getHealth() {
    const redis = await this.redisService.ping();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        api: 'up',
        redis: redis === 'PONG' ? 'up' : 'degraded',
      },
    };
  }
}
