"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useSocket } from "./socket-provider";

const STOP_AFTER = 2500; // emit typing_stop this long after the last keystroke
const EXPIRE_AFTER = 5000; // drop a remote typer if no update lands within this window

interface TypingEvent {
  groupId: string;
  userId: string;
  typing: boolean;
}

/**
 * Typing indicators for one group. `notifyTyping()` is called on each keystroke — it emits
 * `typing_start` once, then `typing_stop` after a short idle. Incoming `user_typing` events drive
 * `typingUserIds`, with a safety expiry so a dropped "stop" can't leave someone stuck as typing.
 */
export function useTyping(groupId: string) {
  const { socket, connected } = useSocket();
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const expiryTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const started = useRef(false);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- receive ----
  useEffect(() => {
    if (!socket) return;
    const timers = expiryTimers.current;

    const onTyping = (e: TypingEvent) => {
      if (e.groupId !== groupId) return;
      const existing = timers.get(e.userId);
      if (existing) clearTimeout(existing);

      if (e.typing) {
        setTypingUserIds((ids) => (ids.includes(e.userId) ? ids : [...ids, e.userId]));
        timers.set(
          e.userId,
          setTimeout(() => {
            timers.delete(e.userId);
            setTypingUserIds((ids) => ids.filter((id) => id !== e.userId));
          }, EXPIRE_AFTER),
        );
      } else {
        timers.delete(e.userId);
        setTypingUserIds((ids) => ids.filter((id) => id !== e.userId));
      }
    };

    socket.on("user_typing", onTyping);
    return () => {
      socket.off("user_typing", onTyping);
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      setTypingUserIds([]);
    };
  }, [socket, groupId]);

  // ---- send ----
  const stopTyping = useCallback(() => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
      stopTimer.current = null;
    }
    if (!started.current) return;
    started.current = false;
    socket?.emit("typing_stop", { groupId });
  }, [socket, groupId]);

  const notifyTyping = useCallback(() => {
    if (!socket || !connected) return;
    if (!started.current) {
      started.current = true;
      socket.emit("typing_start", { groupId });
    }
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(stopTyping, STOP_AFTER);
  }, [socket, connected, groupId, stopTyping]);

  return { typingUserIds, notifyTyping, stopTyping };
}
