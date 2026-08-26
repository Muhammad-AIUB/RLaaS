import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

const logger = new Logger('Bootstrap');

/**
 * Last resort, not a substitute for catching at the source.
 *
 * Node's default policy for an unhandled rejection is to terminate the process.
 * The gateway detaches work with `void` (request logs, webhook notifications),
 * so a single bad row could take the whole instance down and, on Render free
 * tier, cost a ~90s cold start to come back. Those call sites now catch for
 * themselves; this handler exists so that the next one added does not.
 *
 * Registered before bootstrap so it also covers rejections during startup.
 */
process.on('unhandledRejection', (reason: unknown) => {
  logger.error(
    `Unhandled promise rejection: ${
      reason instanceof Error ? reason.message : String(reason)
    }`,
    reason instanceof Error ? reason.stack : undefined,
  );
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.getHttpServer().keepAliveTimeout = 65_000;
  app.getHttpServer().headersTimeout = 66_000;

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('RLaaS Platform API')
    .setDescription(
      'Production-ready RLaaS server API with RBAC, audit logs, simulations, webhooks, and gateway protections.',
    )
    .setVersion('1.0.0')
    .addServer('/api/v1', 'Version 1')
    .addBearerAuth()
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
