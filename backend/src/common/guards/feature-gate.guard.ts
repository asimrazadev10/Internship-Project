/**
 * The per-feature gate for the single API process.
 *
 * The four workers are separate processes, so dev.ps1 can simply not launch one. The API is ONE
 * process serving every feature's routes, so stopping one feature means its routes must 404. Each
 * SERVICE_*_ENABLED flag below turns one feature's routes on/off; this guard is the switch.
 *
 * Match order matters: a path is charged to the MOST SPECIFIC feature first. Messages routes live
 * under /groups/:id/messages, so the messages regex is tested before the groups one — otherwise
 * disabling messages would leave no way to distinguish a /groups/:id (generic) from a
 * /groups/:id/messages (messages) request and the groups regex, tested first, would win and route
 * the messages call to the groups flag. Ordering here is loaded shallow-first cleared deep.
 *
 * The ChatGateway (WebSocket) and Bull Board (/admin/queues) are NOT guards: a WebSocket has no
 * HTTP request and the board is mounted as raw Express middleware. They read their own flags
 * directly (see chat.gateway.ts and queue-board.module.ts).
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface FeatureRoute {
  feature: string;
  flag: string;
  match: RegExp;
}

const FEATURE_ROUTES: FeatureRoute[] = [
  // Ordered so the most specific prefix (messages, nested under groups) is checked first.
  {
    feature: 'messages',
    flag: 'SERVICE_MESSAGES_ENABLED',
    match: /^\/groups\/[^/]+\/messages/,
  },
  { feature: 'groups', flag: 'SERVICE_GROUPS_ENABLED', match: /^\/groups/ },
  {
    feature: 'summaries',
    flag: 'SERVICE_SUMMARIES_ENABLED',
    match: /^\/summaries/,
  },
  { feature: 'auth', flag: 'SERVICE_AUTH_ENABLED', match: /^\/auth/ },
  { feature: 'health', flag: 'SERVICE_HEALTH_ENABLED', match: /^\/health/ },
];

@Injectable()
export class FeatureGateGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ path?: string }>();
    const path = request.path ?? '';

    // Charge the path to the most specific feature that matches it; once charged, either allow it
    // (flag true) or 404 it (flag false). A path that matches nothing is outside every feature and
    // passes through unchanged.
    for (const { feature, flag, match } of FEATURE_ROUTES) {
      if (match.test(path)) {
        if (this.config.get<boolean>(flag, true)) {
          return true;
        }
        throw new NotFoundException(
          `The ${feature} feature is disabled (${flag}=false)`,
        );
      }
    }

    return true;
  }
}
