"use client";

type SharedSocketEntry = {
  socket: WebSocket;
  refCount: number;
  listeners: Set<(event: MessageEvent) => void>;
  statusListeners: Set<(status: "connecting" | "live" | "offline") => void>;
};

const sharedSockets = new Map<string, SharedSocketEntry>();

function notifyStatus(entry: SharedSocketEntry, status: "connecting" | "live" | "offline") {
  for (const listener of entry.statusListeners) {
    listener(status);
  }
}

export function acquireChartWs(
  key: string,
  wsUrl: string,
  onMessage: (event: MessageEvent) => void,
  onStatus: (status: "connecting" | "live" | "offline") => void,
): () => void {
  let entry = sharedSockets.get(key);

  if (!entry) {
    const socket = new WebSocket(wsUrl);
    entry = {
      socket,
      refCount: 0,
      listeners: new Set(),
      statusListeners: new Set(),
    };
    sharedSockets.set(key, entry);

    notifyStatus(entry, "connecting");

    socket.onopen = () => {
      notifyStatus(entry!, "live");
    };

    socket.onmessage = (event) => {
      for (const listener of entry!.listeners) {
        listener(event);
      }
    };

    socket.onerror = () => {
      notifyStatus(entry!, "offline");
    };

    socket.onclose = () => {
      notifyStatus(entry!, "offline");
      if (sharedSockets.get(key) === entry) {
        sharedSockets.delete(key);
      }
    };
  }

  entry.refCount += 1;
  entry.listeners.add(onMessage);
  entry.statusListeners.add(onStatus);

  if (entry.socket.readyState === WebSocket.OPEN) {
    onStatus("live");
  } else if (entry.socket.readyState === WebSocket.CONNECTING) {
    onStatus("connecting");
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
      current.socket.onopen = null;
      current.socket.onmessage = null;
      current.socket.onerror = null;
      current.socket.onclose = null;
      if (
        current.socket.readyState === WebSocket.OPEN ||
        current.socket.readyState === WebSocket.CONNECTING
      ) {
        current.socket.close();
      }
      sharedSockets.delete(key);
    }
  };
}
