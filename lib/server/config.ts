import { configurationError, AppError } from "./errors";

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, max: number) {
  const raw = env[name] ?? String(fallback);
  if (!/^\d+$/.test(raw)) throw configurationError();
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw configurationError();
  return value;
}

export function getConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === "production";
  if (env.AI_ENABLED !== "true") {
    throw new AppError(503, "DISABLED", "現在、AI機能を一時停止しています。");
  }
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw configurationError();
  // Vercel Marketplace provisions KV_REST_API_*; direct Upstash uses UPSTASH_*.
  const directRedis = Boolean(env.UPSTASH_REDIS_REST_URL?.trim() || env.UPSTASH_REDIS_REST_TOKEN?.trim());
  const redisUrl = (directRedis ? env.UPSTASH_REDIS_REST_URL : env.KV_REST_API_URL)?.trim();
  const redisToken = (directRedis ? env.UPSTASH_REDIS_REST_TOKEN : env.KV_REST_API_TOKEN)?.trim();
  const salt = env.RATE_LIMIT_SALT?.trim();
  if (Boolean(redisUrl) !== Boolean(redisToken)) throw configurationError();
  if (production && (!redisUrl || !salt || salt.length < 32)) throw configurationError();
  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw Error();
    } catch { throw configurationError(); }
  }
  const namespace = env.RATE_LIMIT_NAMESPACE || "rakuracook";
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(namespace)) throw configurationError();
  const ipHeader = env.TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (ipHeader && !/^[a-z0-9-]+$/.test(ipHeader)) throw configurationError();
  return {
    apiKey, redisUrl, redisToken, salt: salt || "development-only",
    namespace, ipHeader,
    dailyLimit: integer(env, "AI_DAILY_CALL_LIMIT", 100, 10000),
    minuteLimit: integer(env, "AI_CLIENT_MINUTE_LIMIT", 5, 60),
    concurrency: integer(env, "AI_MAX_CONCURRENT", 3, 20),
  };
}
export type Config = ReturnType<typeof getConfig>;
