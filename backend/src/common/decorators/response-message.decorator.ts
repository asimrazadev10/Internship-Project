/**
 * HOW THIS FILE WORKS
 *   1. RESPONSE_MESSAGE_KEY — the metadata key ResponseInterceptor reads.
 *   2. ResponseMessage() — attaches a success message to a handler as metadata.
 */
import { SetMetadata } from '@nestjs/common';

// Namespaced with a colon so it cannot collide with another library's metadata key.
export const RESPONSE_MESSAGE_KEY = 'response:message';

/**
 * Attaches a human-readable message to the success envelope.
 *
 *   @ResponseMessage('Group created')
 *   @Post()
 *   create(...) { ... }
 *
 * Kept as metadata rather than something the handler returns, so the handler's return value
 * stays pure data and the message never has to be threaded through service layers.
 */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
