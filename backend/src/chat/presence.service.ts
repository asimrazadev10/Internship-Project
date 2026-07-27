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
    excludeSocketId?: string,
  ): Promise<void> {
    const room = roomFor(groupId);
    const sockets = await server.in(room).fetchSockets();
    const userIds = [
      ...new Set(
        sockets
          .filter((s) => s.id !== excludeSocketId)
          .map((s) => (s.data as AuthData)?.userId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    server.to(room).emit(SERVER_EVENTS.PRESENCE, { groupId, userIds });
  }
}
