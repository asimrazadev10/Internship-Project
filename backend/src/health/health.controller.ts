import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';
import { HealthService, ReadinessReport } from './health.service';

/**
 * Liveness and readiness, deliberately SEPARATE endpoints.
 *
 * They answer different questions and must be able to fail independently. Liveness asks "is this
 * process alive, should it be restarted?"; readiness asks "can it serve traffic right now?". The
 * classic mistake is one endpoint doing both: a liveness probe that touches the database restarts
 * a perfectly healthy process during a brief database blip, converting a partial outage into a
 * total one — and taking the in-memory Socket.IO connections down with it.
 *
 * Both are @Public(): the global JwtAuthGuard would otherwise demand a bearer token from a probe
 * that has no way to hold one.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness. Touches nothing — it cannot fail while the process can answer at all. */
  @Public()
  @Get()
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness. 200 when every dependency answers, 503 otherwise, so an orchestrator can stop
   * routing traffic here without killing the process.
   */
  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ok' } & ReadinessReport> {
    const report = await this.health.check();

    const down = Object.entries(report)
      .filter(([, state]) => state === 'down')
      .map(([name]) => name);

    if (down.length > 0) {
      // Naming the failed dependencies in the message keeps the diagnosis in the response, since
      // the error envelope carries a message rather than an arbitrary body.
      throw new ServiceUnavailableException(`Not ready: ${down.join(', ')}`);
    }

    return { status: 'ok', ...report };
  }
}
