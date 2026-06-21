import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis, RedisOptions } from 'ioredis';

/**
 * Socket.IO adapter backed by Redis pub/sub.
 *
 * Why this exists
 *   The realtime gateway broadcasts to `room:*` and `session:*` Socket.IO rooms.
 *   With more than one backend instance (or after a Render restart while clients
 *   reconnect), an in-memory adapter only reaches sockets on the SAME process, so
 *   a chat message or playback event sent from instance A never reaches a viewer
 *   pinned to instance B. The Redis adapter fans every broadcast out across all
 *   instances via pub/sub, so realtime works regardless of which node a socket
 *   landed on.
 *
 * Behaviour
 *   - Local dev  : REDIS_URL = redis://redis:6379 (the Docker `redis` service).
 *   - Production : REDIS_URL = rediss://...upstash.io:6379 (TLS auto-detected).
 *   - No REDIS_URL, or Redis unreachable at boot -> we DO NOT crash. The app
 *     falls back to the default in-memory adapter (correct for a single instance)
 *     and logs a clear warning. This preserves the existing dev workflow.
 *
 * Note: this fans out Socket.IO *broadcasts*. The authoritative live-session
 * Maps (SessionStateService / PresenceService) are still in-process; that is
 * fine for the single free Render instance. Moving that state into Redis is a
 * larger refactor documented in DEPLOYMENT.md.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger('RedisIoAdapter');
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private pubClient?: Redis;
  private subClient?: Redis;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  /** @returns true if the Redis adapter is wired; false => in-memory fallback. */
  async connectToRedis(url: string): Promise<boolean> {
    const useTls = url.startsWith('rediss://');
    const options: RedisOptions = {
      lazyConnect: true,
      // pub/sub clients must not cap retries-per-request (long-lived blocking ops)
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectTimeout: 10_000,
      // Exponential-ish backoff, capped at 5s, so a flaky network self-heals.
      retryStrategy: (times) => Math.min(times * 200, 5_000),
      reconnectOnError: () => true,
      ...(useTls ? { tls: { rejectUnauthorized: false } } : {}),
    };

    const pub = new Redis(url, options);
    const sub = pub.duplicate();
    this.attachLogging(pub, 'pub');
    this.attachLogging(sub, 'sub');

    try {
      await Promise.all([pub.connect(), sub.connect()]);
    } catch (err) {
      this.logger.error(
        `Could not connect to Redis (${(err as Error).message}). ` +
          `Falling back to the in-memory adapter — realtime works on a single instance only.`,
      );
      pub.disconnect();
      sub.disconnect();
      return false;
    }

    this.pubClient = pub;
    this.subClient = sub;
    this.adapterConstructor = createAdapter(pub, sub);
    this.logger.log(
      `Connected to Redis (${redactRedisUrl(url)}) — Socket.IO is using the Redis adapter.`,
    );
    return true;
  }

  private attachLogging(client: Redis, label: string) {
    client.on('ready', () => this.logger.log(`Redis ${label} client ready.`));
    client.on('error', (e: Error) => this.logger.warn(`Redis ${label} error: ${e.message}`));
    client.on('reconnecting', (ms: number) =>
      this.logger.warn(`Redis ${label} reconnecting in ${ms}ms...`),
    );
    client.on('end', () => this.logger.warn(`Redis ${label} connection closed.`));
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  async closeRedis(): Promise<void> {
    await Promise.allSettled([this.pubClient?.quit(), this.subClient?.quit()]);
  }
}

/** Hide credentials when logging a Redis URL. */
function redactRedisUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    if (u.username) u.username = '***';
    return u.toString();
  } catch {
    return 'redis://<unparseable-url>';
  }
}
