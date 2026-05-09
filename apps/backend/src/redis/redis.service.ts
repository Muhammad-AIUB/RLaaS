import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleInit(): Promise<void> {
    if (this.redis.status === 'ready' || this.redis.status === 'connect') {
      return;
    }

    await this.redis.connect();
    this.logger.log('Connected to Redis');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') {
      await this.redis.quit();
    }
  }

  getClient(): Redis {
    return this.redis;
  }

  ping(): Promise<string> {
    return this.redis.ping();
  }
}
