"use client";

type SharedSocketEntry = {
  socket: WebSocket;
  wsUrl: string;
  refCount: number;
  listeners: Set<(event: MessageEvent) => void>;
  statusListeners: Set<(status: "connecting" | "live" | "offline") => void>;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  released: boolean;
};

const sharedSockets = new Map<string, SharedSocketEntry>();

function notifyStatus(entry: SharedSocketEntry, status: "connecting" | "live" | "offline") {
  for (const listener of entry.statusListeners) {
    listener(status);
  }
}

function openSocket(key: string, entry: SharedSocketEntry) {
  const socket = new WebSocket(entry.wsUrl);
  entry.socket = socket;
  notifyStatus(entry, "connecting");

  socket.onopen = () => {
    entry.reconnectAttempts = 0;
    notifyStatus(entry, "live");
  };

  socket.onmessage = (event) => {
    for (const listener of entry.listeners) {
      listener(event);
    }
  };

  socket.onerror = () => {
    notifyStatus(entry, "offline");
  };

  socket.onclose = () => {
    if (entry.released || sharedSockets.get(key) !== entry || entry.refCount <= 0) {
      if (sharedSockets.get(key) === entry) {
        sharedSockets.delete(key);
      }
      return;
    }

    notifyStatus(entry, "offline");
    const delay = Math.min(1_000 * 2 ** entry.reconnectAttempts, 8_000);
    entry.reconnectAttempts += 1;
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
    }
    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = null;
      if (entry.released || entry.refCount <= 0 || sharedSockets.get(key) !== entry) {
        return;
      }
      openSocket(key, entry);
    }, delay);
  };
}

export function acquireChartWs(
  key: string,
  wsUrl: string,
  onMessage: (event: MessageEvent) => void,
  onStatus: (status: "connecting" | "live" | "offline") => void,
): () => void {
  let entry = sharedSockets.get(key);

  if (!entry) {
    entry = {
      socket: undefined as unknown as WebSocket,
      wsUrl,
      refCount: 0,
      listeners: new Set(),
      statusListeners: new Set(),
      reconnectAttempts: 0,
      reconnectTimer: null,
      released: false,
    };
    sharedSockets.set(key, entry);
    openSocket(key, entry);
  }

  entry.refCount += 1;
  entry.listeners.add(onMessage);
  entry.statusListeners.add(onStatus);

  if (entry.socket?.readyState === WebSocket.OPEN) {
    onStatus("live");
  } else if (
    entry.socket?.readyState === WebSocket.CONNECTING ||
    entry.reconnectTimer
  ) {
    onStatus("connecting");
  } else {
    onStatus("offline");
  }

  return () => {
    const current = sharedSockets.get(key);
    if (!current) {
      return;
    }
    current.listeners.delete(onMessage);
    current.statusListeners.delete(onStatus);
    current.refCount -= 1;

    if (current.refCount <= 0) {
      current.released = true;
      if (current.reconnectTimer) {
        clearTimeout(current.reconnectTimer);
        current.reconnectTimer = null;
      }
      const socket = current.socket;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        if (
          socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING
        ) {
          socket.close();
        }
      }
      sharedSockets.delete(key);
    }
  };
}
