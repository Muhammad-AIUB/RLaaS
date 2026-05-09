import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [{ emit: 'event', level: 'query' }],
    });

    // Enable with PRISMA_ACCESS_DIAGNOSTICS=true for targeted prod-like diagnosis.
    if (process.env.PRISMA_ACCESS_DIAGNOSTICS === 'true') {
      this.$on('query' as never, (event: Prisma.QueryEvent) => {
        if (!event.query.includes('"project_members"')) {
          return;
        }

        const compactQuery = event.query.replace(/\s+/g, ' ').trim();
        this.logger.debug(
          `Prisma project_members query durationMs=${event.duration} params=${event.params} sql="${compactQuery}"`,
        );
      });
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
