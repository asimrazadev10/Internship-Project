"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { tokenStore } from "@/lib/api/tokens";
import type { Message } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { messageKeys } from "@/lib/queries/messages";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3000";

interface SocketValue {
  socket: Socket | null;
  connected: boolean;
}
const SocketContext = createContext<SocketValue>({ socket: null, connected: false });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;

    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      auth: { token: tokenStore.access },
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    // The one place socket-pushed messages enter the app. Route by the message's own groupId.
    socket.on("new_message", (message: Message) => {
      queryClient.setQueryData<Message[]>(
        messageKeys.live(message.groupId),
        (old = []) =>
          old.some((m) => m.id === message.id) ? old : [...old, message],
      );
    });

    return () => {
      socket.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [status, queryClient]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
