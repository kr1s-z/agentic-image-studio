import { useState, useEffect, useRef, useCallback } from "react";
import { WSMessage } from "../types";

export interface UseWebSocketReturn {
  connected: boolean;
  trace: WSMessage[];
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket(jobId: string | null): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [trace, setTrace] = useState<WSMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();
  const jobIdRef = useRef(jobId);
  const shouldReconnect = useRef(true);

  jobIdRef.current = jobId;

  const connect = useCallback(() => {
    const id = jobIdRef.current;
    if (!id) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/jobs/${id}/ws`,
    );
    wsRef.current = ws;

    ws.addEventListener("open", () => setConnected(true));

    ws.addEventListener("message", (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        setTrace((prev) => [...prev, msg]);
      } catch {
        /* ignore malformed frames */
      }
    });

    ws.addEventListener("close", () => {
      setConnected(false);
      if (shouldReconnect.current && jobIdRef.current === id) {
        reconnectRef.current = setTimeout(() => connect(), 3000);
      }
    });

    ws.addEventListener("error", () => ws.close());
  }, []);

  const disconnect = useCallback(() => {
    shouldReconnect.current = false;
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setTrace([]);
  }, []);

  useEffect(() => {
    if (jobId) {
      shouldReconnect.current = true;
      connect();
    }
    return () => {
      shouldReconnect.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [jobId, connect]);

  return { connected, trace, connect, disconnect };
}
