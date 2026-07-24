"use client";

import { useEffect, useState } from "react";

import { useSocket } from "./socket-provider";

/** The user ids currently online in a group (at least one connected socket in its room). */
export function usePresence(groupId: string) {
  const { socket } = useSocket();
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (!socket) return;
    const onPresence = (p: { groupId: string; userIds: string[] }) => {
      if (p.groupId === groupId) setOnlineUserIds(p.userIds);
    };
    socket.on("presence", onPresence);
    return () => {
      socket.off("presence", onPresence);
      setOnlineUserIds([]);
    };
  }, [socket, groupId]);

  return onlineUserIds;
}
