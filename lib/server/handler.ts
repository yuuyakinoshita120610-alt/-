import { randomUUID } from "node:crypto";
import { getConfig } from "./config";
import { acquire } from "./limiter";
import { readImage, readIngredients } from "./input";
import { generate, mapError, type Operation } from "./ai";
import { AppError } from "./errors";

export async function handle(request: Request, operation: Operation) {
  const requestId = randomUUID();
  const started = Date.now();
  const headers: Record<string, string> = { "Cache-Control": "no-store", "X-Request-Id": requestId };
  let release: (() => Promise<void>) | undefined;
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new AppError(403, "ORIGIN", "このページから操作をやり直してください。");
    const config = getConfig();
    // Count reservations even on invalid inputs, failures or cancellation.
    // Provider failures may still incur cost, so there are no automatic refunds.
    release = await acquire(request, config);
    const input = operation === "analyze" ? await readImage(request) : await readIngredients(request);
    request.signal.throwIfAborted();
    const data = await generate(operation, input, config, request.signal);
    console.info(JSON.stringify({ event: "ai_success", operation, requestId, durationMs: Date.now() - started }));
    return Response.json({ ...data, requestId }, { headers });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped.retryAfter) headers["Retry-After"] = String(mapped.retryAfter);
    // Never log raw errors, images, prompts, IP addresses or credentials.
    console.warn(JSON.stringify({ event: "ai_error", operation, requestId, code: mapped.code, status: mapped.status, durationMs: Date.now() - started }));
    return Response.json({ error: mapped.message, code: mapped.code, requestId, ...(mapped.retryAfter ? { retryAfter: mapped.retryAfter } : {}) }, { status: mapped.status, headers });
  } finally {
    await release?.();
  }
}
