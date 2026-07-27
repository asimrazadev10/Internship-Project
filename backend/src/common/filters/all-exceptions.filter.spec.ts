import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ErrorCode } from '../http/api-response';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', url: '/health/ready' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  /**
   * A 503 used to fall through the status-range default and be reported as INTERNAL_ERROR.
   * Clients branch on this code and the two mean opposite things: INTERNAL_ERROR is not worth
   * retrying, SERVICE_UNAVAILABLE is precisely what a retry is for.
   */
  it('reports 503 as SERVICE_UNAVAILABLE, not INTERNAL_ERROR', () => {
    const { host, status, json } = makeHost();

    new AllExceptionsFilter().catch(
      new ServiceUnavailableException('Not ready: redis'),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Not ready: redis',
      },
    });
  });

  /**
   * 503 is a signal we raise deliberately, not an unanticipated throw. A readiness probe polling
   * every few seconds would otherwise fill the log with stack traces during the one incident you
   * most need to read it.
   */
  it('logs 503 at warn without a stack, not as a fault', () => {
    const { host } = makeHost();

    new AllExceptionsFilter().catch(new ServiceUnavailableException(), host);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('still logs a genuine unexpected fault at error with its stack', () => {
    const { host, status } = makeHost();

    new AllExceptionsFilter().catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(errorSpy).toHaveBeenCalled();
    // The internal message must never reach the client.
    expect(errorSpy.mock.calls[0][1]).toContain('boom');
  });

  it('maps a 404 to NOT_FOUND and logs it at warn', () => {
    const { host, json } = makeHost();

    new AllExceptionsFilter().catch(
      new NotFoundException('Group not found'),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      success: false,
      error: { code: ErrorCode.NOT_FOUND, message: 'Group not found' },
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('lifts ValidationPipe constraint arrays into details', () => {
    const { host, json } = makeHost();

    new AllExceptionsFilter().catch(
      new BadRequestException(['name must be a string']),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: ['name must be a string'],
      },
    });
  });
});
