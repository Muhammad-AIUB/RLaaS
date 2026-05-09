import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const queryDebugEnabled = process.env.PRISMA_QUERY_DEBUG === 'true';

    super(
      queryDebugEnabled
        ? {
            log: [{ emit: 'event', level: 'query' }],
          }
        : undefined,
    );

    if (queryDebugEnabled) {
      this.$on('query' as never, (event: Prisma.QueryEvent) => {
        const compactQuery = event.query.replace(/\s+/g, ' ').trim();
        const queryPreview =
          compactQuery.length > 240
            ? `${compactQuery.slice(0, 240)}...`
            : compactQuery;
        this.logger.debug(
          `Prisma query durationMs=${event.duration} target=${event.target} sqlPreview="${queryPreview}"`,
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
