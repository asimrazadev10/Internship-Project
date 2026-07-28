/**
 * HOW THIS FILE WORKS
 *   1. Resolve the group's room name.
 *   2. fetchSockets() the room — this spans nodes under the Redis adapter.
 *   3. Drop the excluded socket, map to user ids, and de-duplicate.
 *   4. Emit the resulting presence list to the room.
 *
 * Counting distinct USERS, not sockets, so one person on two tabs appears once.
 */
import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

import { SERVER_EVENTS, roomFor } from './chat.constants';
import type { AuthData } from './ws.types';

/**
 * Who is currently online in a group: the distinct users with at least one socket in its room.
 *
 * Uses the adapter's `fetchSockets()`, which spans nodes under the Redis adapter — so the count
 * stays correct when the API runs multi-node. A local `Map` of connections would be wrong the
 * moment a second instance exists, which is the whole reason this is worth its own unit.
 *
 * The Server is passed IN rather than injected: it belongs to the gateway, which owns it via
 * @WebSocketServer(). Taking it as an argument keeps this a plain @Injectable with no Socket.IO
 * lifecycle coupling and nothing to bind at startup — so it is trivially unit-testable with a
 * stub server.
 */
@Injectable()
export class PresenceService {
  async broadcast(
    server: Server,
    groupId: string,
    // Set on disconnect: the leaving socket is still in the room when this runs.
    excludeSocketId?: string,
  ): Promise<void> {
    const room = roomFor(groupId);
    // Step 2. Asks every node via Redis, not just this process's local connections.
    const sockets = await server.in(room).fetchSockets();
    // Step 3. Set de-duplicates, so one user on several tabs counts once.
    const userIds = [
      ...new Set(
        sockets
          .filter((s) => s.id !== excludeSocketId)
          .map((s) => (s.data as AuthData)?.userId)
          // Type-guard filter drops any socket without auth data attached.
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    // Step 4. To the room, so every member sees the same list.
    server.to(room).emit(SERVER_EVENTS.PRESENCE, { groupId, userIds });
  }
}
