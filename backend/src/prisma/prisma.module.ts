import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Marked @Global for the same reason ConfigModule is: database access is cross-cutting
 * infrastructure, not a domain dependency. Making every feature module import PrismaModule
 * would be boilerplate that communicates nothing — the alternative is not stricter
 * boundaries, just a longer imports array in each module.
 *
 * Domain boundaries are still enforced where they matter: feature modules depend on each
 * other's services explicitly, never on each other's tables.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
