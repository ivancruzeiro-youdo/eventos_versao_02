import Redis from 'ioredis';
import { createHash } from 'crypto';

// Lazily created — if REDIS_URL isn't set (e.g. a stripped-down local dev setup),
// the blacklist becomes a silent no-op instead of crashing the server. Redis is
// already part of the production stack (docker-compose.prod.yml) for this purpose.
let client: Redis | null = null;
let triedConnecting = false;

function getRedis(): Redis | null {
  if (client) return client;
  if (triedConnecting) return null;
  triedConnecting = true;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  client = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: false });
  client.on('error', (err) => console.error('Redis connection error:', err.message));
  return client;
}

// Tokens aren't stored verbatim — only their hash — so a Redis-level compromise
// doesn't hand over live session tokens.
function tokenKey(token: string): string {
  return `blacklist:${createHash('sha256').update(token).digest('hex')}`;
}

export async function blacklistToken(token: string, expiresInSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis || expiresInSeconds <= 0) return;
  try {
    await redis.set(tokenKey(token), '1', 'EX', expiresInSeconds);
  } catch (err: any) {
    console.error('Failed to blacklist token:', err.message);
  }
}

export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    return (await redis.get(tokenKey(token))) === '1';
  } catch (err: any) {
    console.error('Failed to check token blacklist:', err.message);
    return false; // fail open — a Redis hiccup shouldn't lock everyone out
  }
}
