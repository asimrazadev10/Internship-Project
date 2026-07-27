"use client";

import { useEffect } from "react";

import { useSocket } from "./socket-provider";
import { CLIENT_EVENTS } from "./socket-events";

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
