import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>('REDIS_URL');
        return url
          ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 })
          : new Redis({
              host: configService.get<string>('REDIS_HOST', '127.0.0.1'),
              port: configService.get<number>('REDIS_PORT', 6379),
              lazyConnect: true,
              maxRetriesPerRequest: 1,
            });
      },
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
