/**
 * HOW THIS FILE WORKS
 *   1. Provide StorageService.
 *   2. Export it for MessagesModule's upload route.
 */
import { Module } from '@nestjs/common';

import { StorageService } from './storage.service';

/** Exposes StorageService so MessagesModule can stream attachment bytes to Supabase Storage. */
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
