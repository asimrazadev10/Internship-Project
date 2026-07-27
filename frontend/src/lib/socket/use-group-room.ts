"use client";

import { useEffect, useState } from "react";

import { useSocket } from "./socket-provider";
import { CLIENT_EVENTS, SERVER_EVENTS } from "./socket-events";

/**
 * Being in a group's socket room, from both directions: joining/leaving it, and hearing who else
 * is in it.
 *
 * They live together because the backend already treats them as one operation — joinGroup awaits
 * broadcastPresence before returning, and leaveGroup does the same — so the `presence` payload
 * this file listens for is literally the echo of the `join_group` it emits.
 *
 * Two separate effects rather than one, on purpose: they have different socket preconditions. The
 * join emit needs `connected` (emitting before the handshake completes would be dropped), while
 * the presence listener only needs a socket instance — attaching a listener early is free, and
 * waiting for `connected` would risk missing the first payload.
 *
 * Deliberately does NOT absorb use-typing.ts: that carries its own timer policy and a per-user
 * expiry Map, and a file mixing three concerns is harder to defend than three focused ones.
 */

/** Join the group's socket room while this component is mounted; leave on unmount. */
export function useGroupRoom(groupId: string) {
  const { socket, connected } = useSocket();
  useEffect(() => {
    if (!socket || !connected || !groupId) return;
    void socket.emit(CLIENT_EVENTS.JOIN_GROUP, { groupId });
    return () => {
      void socket.emit(CLIENT_EVENTS.LEAVE_GROUP, { groupId });
    };
  }, [socket, connected, groupId]);
}

/** The user ids currently online in a group (at least one connected socket in its room). */
export function usePresence(groupId: string) {
  const { socket } = useSocket();
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (!socket) return;
    const onPresence = (p: { groupId: string; userIds: string[] }) => {
      if (p.groupId === groupId) setOnlineUserIds(p.userIds);
    };
    socket.on(SERVER_EVENTS.PRESENCE, onPresence);
    return () => {
      socket.off(SERVER_EVENTS.PRESENCE, onPresence);
      setOnlineUserIds([]);
    };
  }, [socket, groupId]);

  return onlineUserIds;
}
