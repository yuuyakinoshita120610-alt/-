import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { Config } from "./config";
import { AppError } from "./errors";

// Atomic admission across both APIs and all server instances. Shared hash tag
// supports Redis Cluster; Redis time avoids application server clock drift.
export const ADMIT_SCRIPT = `
local now = tonumber(redis.call('TIME')[1])
local day = math.floor(now / 86400)
local minute = math.floor(now / 60)
local daily = 0
local recent = 0
if tonumber(redis.call('HGET', KEYS[1], 'window')) == day then
  daily = tonumber(redis.call('HGET', KEYS[1], 'count')) or 0
end
if tonumber(redis.call('HGET', KEYS[2], 'window')) == minute then
  recent = tonumber(redis.call('HGET', KEYS[2], 'count')) or 0
end
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', now)
if daily >= tonumber(ARGV[1]) then return {1, 86400 - now % 86400} end
if recent >= tonumber(ARGV[2]) then return {2, 60 - now % 60} end
if redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[3]) or redis.call('ZCARD', KEYS[4]) >= 1 then return {3, 5} end
redis.call('HSET', KEYS[1], 'window', day, 'count', daily + 1)
redis.call('EXPIRE', KEYS[1], 172800)
redis.call('HSET', KEYS[2], 'window', minute, 'count', recent + 1)
redis.call('EXPIRE', KEYS[2], 120)
redis.call('ZADD', KEYS[3], now + 90, ARGV[4])
redis.call('ZADD', KEYS[4], now + 90, ARGV[4])
redis.call('EXPIRE', KEYS[3], 120)
redis.call('EXPIRE', KEYS[4], 120)
return {0, 0}
`;
const RELEASE_SCRIPT = `redis.call('ZREM', KEYS[1], ARGV[1]); redis.call('ZREM', KEYS[2], ARGV[1]); return 1`;

export function clientKey(request: Request, config: Config) {
  // Only trust a single IP header overwritten by the hosting proxy.
  // Without one, everyone shares a conservative bucket; never trust arbitrary XFF.
  const raw = config.ipHeader ? request.headers.get(config.ipHeader)?.trim() : undefined;
  const identity = raw && isIP(raw) ? raw : "shared";
  return createHmac("sha256", config.salt).update(identity).digest("hex");
}

function rejected(code: number, retry: number): never {
  if (code === 1) throw new AppError(429, "DAILY_LIMIT", "本日のAI利用上限に達しました。時間を置いてお試しください。", retry);
  if (code === 2) throw new AppError(429, "RATE_LIMIT", "短時間の利用回数が上限に達しました。少し待ってお試しください。", retry);
  throw new AppError(429, "BUSY", "現在処理中です。少し待ってからお試しください。", retry);
}

async function redis(config: Config, command: (string | number)[]): Promise<unknown> {
  try {
    const response = await fetch(config.redisUrl!, {
      method: "POST", headers: { Authorization: `Bearer ${config.redisToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(command), cache: "no-store", signal: AbortSignal.timeout(2000), redirect: "error",
    });
    if (!response.ok) throw Error();
    const data = await response.json();
    if (!data || data.error || !("result" in data)) throw Error();
    return data.result;
  } catch {
    throw new AppError(503, "LIMITER_UNAVAILABLE", "現在混み合っています。しばらくしてからお試しください。", 10);
  }
}

type MemoryState = { day: number; daily: number; clients: Map<string, { minute: number; count: number; active: Map<string, number> }> };
const memory: MemoryState = { day: -1, daily: 0, clients: new Map() };

export async function acquire(request: Request, config: Config): Promise<() => Promise<void>> {
  const client = clientKey(request, config);
  const token = randomUUID();
  if (config.redisUrl) {
    const prefix = `{${config.namespace}}`;
    const keys = [`${prefix}:day`, `${prefix}:minute:${client}`, `${prefix}:active`, `${prefix}:active:${client}`];
    const result = await redis(config, ["EVAL", ADMIT_SCRIPT, 4, ...keys, config.dailyLimit, config.minuteLimit, config.concurrency, token]);
    if (!Array.isArray(result) || result.length !== 2 || !Number.isInteger(result[0]) || ![0, 1, 2, 3].includes(result[0]) || !Number.isInteger(result[1]) || result[1] < 0) {
      throw new AppError(503, "LIMITER_UNAVAILABLE", "現在サービスを利用できません。");
    }
    if (result[0] !== 0) rejected(result[0], result[1]);
    return async () => {
      try { await redis(config, ["EVAL", RELEASE_SCRIPT, 2, keys[2], keys[3], token]); }
      catch { console.warn(JSON.stringify({ event: "limiter_release_failed" })); }
    };
  }
  // Development only, with an additional guard against accidental production use.
  if (process.env.NODE_ENV === "production") throw new AppError(503, "CONFIGURATION", "現在サービスの準備中です。");
  const now = Date.now();
  const day = Math.floor(now / 86_400_000);
  const minute = Math.floor(now / 60_000);
  if (memory.day !== day) { memory.day = day; memory.daily = 0; }
  let active = 0;
  for (const [key, state] of memory.clients) {
    for (const [id, expires] of state.active) if (expires <= now) state.active.delete(id);
    if (!state.active.size && state.minute !== minute) memory.clients.delete(key);
    active += state.active.size;
  }
  const state = memory.clients.get(client) || { minute, count: 0, active: new Map<string, number>() };
  if (state.minute !== minute) { state.minute = minute; state.count = 0; }
  if (memory.daily >= config.dailyLimit) rejected(1, Math.ceil((86_400_000 - now % 86_400_000) / 1000));
  if (state.count >= config.minuteLimit) rejected(2, 60);
  if (active >= config.concurrency || state.active.size || memory.clients.size >= 1000 && !memory.clients.has(client)) rejected(3, 5);
  memory.daily++;
  state.count++;
  state.active.set(token, now + 90_000);
  memory.clients.set(client, state);
  return async () => { state.active.delete(token); };
}
