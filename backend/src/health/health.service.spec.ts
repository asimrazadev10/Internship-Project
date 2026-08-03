import { Connection } from 'mongoose';
import { Queue } from 'bullmq';

import { DEPENDENCY_CHECK_TIMEOUT_MS } from './health.constants';
import { HealthService } from './health.service';

function make(opts: {
  dbImpl?: () => Promise<unknown>;
  pingImpl?: () => Promise<unknown>;
}) {
  const connection = {
    db: {
      admin: () => ({
        ping: jest
          .fn()
          .mockImplementation(
            opts.dbImpl ?? (() => Promise.resolve({ ok: 1 })),
          ),
      }),
    },
  } as unknown as Connection;

  const client = {
    ping: jest
      .fn()
      .mockImplementation(opts.pingImpl ?? (() => Promise.resolve('PONG'))),
  };
  const queue = { client: Promise.resolve(client) } as unknown as Queue;

  return { service: new HealthService(connection, queue) };
}

describe('HealthService.check', () => {
  it('reports both dependencies up when they answer', async () => {
    const { service } = make({});

    await expect(service.check()).resolves.toEqual({
      database: 'up',
      redis: 'up',
    });
  });

  it('reports only the failing dependency down', async () => {
    const { service } = make({
      pingImpl: () => Promise.reject(new Error('ECONNREFUSED')),
    });

    await expect(service.check()).resolves.toEqual({
      database: 'up',
      redis: 'down',
    });
  });

  // An unreachable database does not refuse the connection, it stops answering. Without the
  // timeout the probe would hang for as long as the driver's own, and a readiness endpoint that
  // hangs tells an orchestrator nothing at all.
  it('calls a dependency down when it stops answering', async () => {
    jest.useFakeTimers();
    const { service } = make({ dbImpl: () => new Promise(() => {}) });

    const pending = service.check();
    await jest.advanceTimersByTimeAsync(DEPENDENCY_CHECK_TIMEOUT_MS + 1);

    await expect(pending).resolves.toEqual({
      database: 'down',
      redis: 'up',
    });
    jest.useRealTimers();
  });

  it('checks both dependencies even when the first is down', async () => {
    const { service } = make({
      dbImpl: () => Promise.reject(new Error('down')),
      pingImpl: () => Promise.reject(new Error('down')),
    });

    await expect(service.check()).resolves.toEqual({
      database: 'down',
      redis: 'down',
    });
  });
});
