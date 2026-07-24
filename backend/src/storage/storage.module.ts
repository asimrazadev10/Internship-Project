import { Module } from '@nestjs/common';

import { StorageService } from './storage.service';

/** Exposes StorageService so MessagesModule can stream attachment bytes to Supabase Storage. */
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
