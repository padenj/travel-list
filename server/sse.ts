import { Response, Request } from 'express';
import crypto from 'crypto';

type EventPayload = { type: string; listId?: string; data?: any };

type SseClient = {
  id: string;
  res: Response;
  ip?: string;
  ua?: string;
  connectedAt: number;
  lastWriteAt?: number;
};

const clients: SseClient[] = [];

const MAX_CONNECTIONS_PER_KEY = 1; // allow up to N connections per (user | ip | ua) key

function normalizeIp(addr?: string | null | undefined) {
  if (!addr) return undefined;
  // strip IPv4-mapped IPv6 addresses like ::ffff:127.0.0.1
  if (addr.startsWith('::ffff:')) return addr.slice('::ffff:'.length);
  if (addr === '::1') return '127.0.0.1';
  return addr;
}

function dumpClientSummary() {
  try {
    const byIp: Record<string, number> = {};
    for (const c of clients) {
      const ip = c.ip || 'unknown';
      byIp[ip] = (byIp[ip] || 0) + 1;
    }
    console.log('[SSE] clients summary count=', clients.length, 'byIp=', byIp);
  } catch (e) {}
}

export function addClient(res: Response, req?: Request) {
  const id = crypto.randomUUID();
  const ipRaw = req ? (req.ip || (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress) : undefined;
  const ip = normalizeIp(ipRaw as string | undefined);
  const ua = req ? (req.headers['user-agent'] as string | undefined) : undefined;
  const client: SseClient & { remotePort?: number; userId?: string } = {
    id,
    res,
    ip,
    ua,
    connectedAt: Date.now(),
  };
  // attach remotePort if available for disambiguation
  try {
    if (req && req.socket && (req.socket as any).remotePort) {
      (client as any).remotePort = (req.socket as any).remotePort;
    }
    // If auth middleware attached a user, record user id
    if (req && (req as any).user && (req as any).user.id) {
      (client as any).userId = (req as any).user.id;
    }
  } catch (e) {}
  
  // Deduplicate / limit connections by a key composed of userId|ip|ua BEFORE adding new client
  try {
    const key = `${(client as any).userId || 'anon'}|${client.ip || 'unknown'}|${(client.ua || '').slice(0,200)}`;
    console.log('[SSE] checking dedupe for key:', key.slice(0, 100) + '...');
    // find existing clients with same key
    const matches = clients.filter(c => {
      const cid = (c as any).userId || 'anon';
      const cua = c.ua || '';
      const cip = c.ip || 'unknown';
      return `${cid}|${cip}|${cua.slice(0,200)}` === key;
    });
    console.log('[SSE] found', matches.length, 'existing clients with same key');
    if (matches.length >= MAX_CONNECTIONS_PER_KEY) {
      // remove the oldest matches until below limit
      const sorted = matches.sort((a, b) => (a.connectedAt - b.connectedAt));
      const numToRemove = matches.length - (MAX_CONNECTIONS_PER_KEY - 1);
      console.log('[SSE] removing', numToRemove, 'oldest connections for key:', key.slice(0, 50) + '...');
      for (let i = 0; i < numToRemove; i++) {
        try { 
          console.log('[SSE] removing old client id:', sorted[i].id);
          removeClient(sorted[i].res); 
        } catch (e) {}
      }
    }
  } catch (e) {
    console.warn('[SSE] dedupe error:', e);
  }
  
  clients.push(client);
  try { console.log('[SSE] client added id=', id, 'ip=', client.ip, 'port=', (client as any).remotePort, 'user=', (client as any).userId, 'ua=', (client.ua || '').slice(0,80), 'total=', clients.length); } catch (e) {}
  dumpClientSummary();
  return id;
}

export function removeClient(res: Response) {
  const idx = clients.findIndex(c => c.res === res);
  if (idx >= 0) {
    const removed = clients.splice(idx, 1)[0];
    try { console.log('[SSE] client removed id=', removed.id, 'ip=', removed.ip, 'total=', clients.length); } catch (e) {}
    try {
      // Attempt to end the response so the socket is closed on the client
      if (removed.res && typeof removed.res.end === 'function') {
        try { removed.res.end(); } catch (e) { /* ignore errors when ending */ }
      }
    } catch (e) {}
  } else {
    try { console.log('[SSE] removeClient called but response not found, total=', clients.length); } catch (e) {}
  }
  dumpClientSummary();
}

export function getClients() {
  return clients.map(c => ({ id: c.id, ip: c.ip, ua: c.ua, connectedAt: c.connectedAt, lastWriteAt: c.lastWriteAt, remotePort: (c as any).remotePort, userId: (c as any).userId }));
}

export function broadcastEvent(ev: EventPayload) {
  const payload = `data: ${JSON.stringify(ev)}\n\n`;
  try { console.log('[SSE] broadcasting event to', clients.length, 'clients', ev); } catch (e) {}
  // Use setImmediate for each write so a slow client cannot block the event loop
  for (const client of clients.slice()) {
    try {
      setImmediate(() => {
        try {
          client.res.write(payload);
          client.lastWriteAt = Date.now();
        } catch (e) {
          // Remove the client if writing fails
          try { console.error('[SSE] write error for client id=', client.id, 'err=', e); } catch (er) {}
          try { removeClient(client.res); } catch (er) {}
        }
      });
    } catch (e) {
      try { console.error('[SSE] scheduling write failed for client id=', client.id, 'err=', e); } catch (er) {}
      try { removeClient(client.res); } catch (er) {}
    }
  }
}

// Heartbeat to keep SSE connections active and detect dead clients (every 30s)
setInterval(() => {
  const heartbeat = `: heartbeat\n\n`;
  for (const client of clients.slice()) {
    try {
      setImmediate(() => {
        try { client.res.write(heartbeat); client.lastWriteAt = Date.now(); } catch (e) { try { console.error('[SSE] heartbeat failed for', client.id, e); removeClient(client.res); } catch (er) {} }
      });
    } catch (e) {
      try { console.error('[SSE] scheduling heartbeat failed for client', client.id, e); removeClient(client.res); } catch (er) {}
    }
  }
}, 30_000);
