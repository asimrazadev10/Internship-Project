import { Module } from '@nestjs/common';

import { UsersService } from './users.service';

/**
 * Exports UsersService so the auth module can read and write users without reaching into the
 * User table directly. Feature modules depend on each other's services, never each other's
 * tables — that is the boundary the folder structure is meant to enforce.
 */
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
