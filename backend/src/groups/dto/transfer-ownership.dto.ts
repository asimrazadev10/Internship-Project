/**
 * HOW THIS FILE WORKS
 *   1. Validate that userId is a UUID.
 *
 * Whether that user is a member — and whether the caller may transfer at all — is decided in
 * GroupsService inside the transaction, because both are database facts.
 */
import { IsUUID } from 'class-validator';

export class TransferOwnershipDto {
  // Any UUID version: ids in this app are v7, which class-validator's default (3/4/5) rejects.
  @IsUUID(undefined, { message: 'userId must be a UUID' })
  userId: string;
}
