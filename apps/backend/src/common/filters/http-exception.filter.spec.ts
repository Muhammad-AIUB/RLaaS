import { BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

/**
 * The filter catches everything, so it is the last place an unexpected error
 * can be recorded. It used to record nothing: a 500 in production returned a
 * generic body to the client and left no stack, message or route behind. That
 * is how a malformed UUID could 500 six route families with no log line to
 * point at it.
 */
describe('HttpExceptionFilter', () => {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/api/v1/projects/abc', method: 'GET' }),
    }),
  } as unknown as ArgumentsHost;

  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    json.mockClear();
    status.mockClear();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('logs an unhandled non-HTTP exception with its route and stack', () => {
    const filter = new HttpExceptionFilter();
    const boom = new Error('Inconsistent column data: Error creating UUID');

    filter.catch(boom, host);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message, stack] = errorSpy.mock.calls[0];
    expect(message).toContain('GET /api/v1/projects/abc');
    expect(message).toContain('Inconsistent column data');
    expect(stack).toBe(boom.stack);
  });

  it('still hides the cause from the client', () => {
    const filter = new HttpExceptionFilter();

    filter.catch(new Error('connection string user=admin password=hunter2'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          message: 'Internal server error',
          statusCode: 500,
        }),
      }),
    );
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('hunter2');
  });

  it('logs a deliberate 5xx too', () => {
    const filter = new HttpExceptionFilter();

    filter.catch(new InternalServerErrorException('upstream is down'), host);

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('does not log a 4xx: a client mistake is not an incident', () => {
    const filter = new HttpExceptionFilter();

    filter.catch(new BadRequestException('Malformed id: expected a UUID'), host);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
  });
});
