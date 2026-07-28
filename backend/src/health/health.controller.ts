/**
 * HOW THIS FILE WORKS
 *   1. GET /health — liveness. Returns ok unconditionally, touching no dependency.
 *   2. GET /health/ready — readiness. Runs the probes via HealthService.
 *   3. Collect the names of any dependency reporting 'down'.
 *   4. Throw 503 naming them, or return 200 with the full report.
 *
 * Two endpoints because liveness and readiness must be able to fail independently.
 */
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
  // Step 1. @Public() opts this route out of the global JwtAuthGuard.
  @Public()
  @Get()
  live(): { status: 'ok' } {
    // No dependency call at all — answering IS the proof the process is alive.
    return { status: 'ok' };
  }

  /**
   * Readiness. 200 when every dependency answers, 503 otherwise, so an orchestrator can stop
   * routing traffic here without killing the process.
   */
  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ok' } & ReadinessReport> {
    // Step 2. Both probes run in parallel inside check().
    const report = await this.health.check();

    // Step 3. Report is a flat name -> state map, so filtering it gives the failed names.
    const down = Object.entries(report)
      .filter(([, state]) => state === 'down')
      .map(([name]) => name);

    if (down.length > 0) {
      // Naming the failed dependencies in the message keeps the diagnosis in the response, since
      // the error envelope carries a message rather than an arbitrary body.
      throw new ServiceUnavailableException(`Not ready: ${down.join(', ')}`);
    }

    // Step 4. Spread the report so a healthy response still shows each dependency's state.
    return { status: 'ok', ...report };
  }
}
