import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as { message?: unknown })?.message ??
          'Internal server error';

    /**
     * Anything that is not an HttpException reached here by accident, and the
     * client is being told nothing but "Internal server error" — correctly, it
     * must not see internals. So this is the only place the cause survives.
     *
     * It used to survive nowhere: this filter caught every exception and
     * logged none of them, so a 500 in production left no stack, no message
     * and no route. That is how a malformed UUID could 500 six route families
     * for weeks without a single log line to point at it.
     *
     * 5xx from an explicit HttpException is logged too (someone threw
     * InternalServerErrorException on purpose and still wants to know); 4xx is
     * not, because client mistakes are not incidents.
     */
    if (!(exception instanceof HttpException)) {
      this.logger.error(
        `Unhandled ${
          exception instanceof Error ? exception.name : typeof exception
        } on ${request.method} ${request.url}: ${
          exception instanceof Error ? exception.message : String(exception)
        }`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${status} on ${request.method} ${request.url}: ${JSON.stringify(message)}`,
        exception.stack,
      );
    }

    response.status(status).json({
      success: false,
      error: {
        message,
        statusCode: status,
        path: request.url,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
