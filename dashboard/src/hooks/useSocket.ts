import { useEffect, useRef, useState } from 'react';

interface SocketEvent {
  type: string;
  data: any;
  timestamp: string;
}

export function useSocket(url?: string) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SocketEvent | null>(null);
  const [events, setEvents] = useState<SocketEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const wsUrl = url || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data) as SocketEvent;
            setLastEvent(parsed);
            setEvents((prev) => [parsed, ...prev].slice(0, 100));
          } catch {
            // Ignore non-JSON messages
          }
        };

        ws.onclose = () => {
          setConnected(false);
          // Reconnect after 3 seconds
          reconnectTimer = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        reconnectTimer = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url]);

  const send = (type: string, data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    }
  };

  return { connected, lastEvent, events, send };
}

export function useRealtimeStats() {
  const [stats, setStats] = useState<Record<string, any>>({});
  const { lastEvent, connected } = useSocket();

  useEffect(() => {
    if (lastEvent?.type === 'stats_update') {
      setStats(lastEvent.data);
    }
  }, [lastEvent]);

  return { stats, connected };
}
