"use client";

import { useEffect } from "react";

import { useSocket } from "./socket-provider";

/** Join the group's socket room while this component is mounted; leave on unmount. */
export function useGroupRoom(groupId: string) {
  const { socket, connected } = useSocket();
  useEffect(() => {
    if (!socket || !connected || !groupId) return;
    void socket.emit("join_group", { groupId });
    return () => {
      void socket.emit("leave_group", { groupId });
    };
  }, [socket, connected, groupId]);
}
