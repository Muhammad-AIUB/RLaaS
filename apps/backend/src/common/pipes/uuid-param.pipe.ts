import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

/**
 * Validates a `:someId` path parameter before it reaches Prisma.
 *
 * Every id column in schema.prisma is `@db.Uuid`. A path parameter that is not
 * a UUID therefore reached the driver and raised PrismaClientKnownRequestError,
 * which is not an HttpException, so the global filter returned a bare 500 —
 * on `/projects/:projectId` and on all six of its nested route families. A
 * mistyped URL or a stale bookmark rendered "Something went wrong — Internal
 * server error" in the dashboard, and every scanner probing for ids added a
 * 500 to the error budget.
 *
 * A malformed id is a client mistake, so it gets 400. A well-formed id that
 * does not exist is still 404 from the service, as before.
 *
 * One shared instance: pipes are stateless, and a single definition keeps the
 * message identical across all 34 parameter sites.
 */
export const UuidParam = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException('Malformed id: expected a UUID'),
});
