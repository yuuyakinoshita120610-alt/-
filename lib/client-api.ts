import { z } from "zod";

export async function postApi<T>(url: string, body: FormData | { ingredients: string[] }, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  const timedSignal = AbortSignal.any([signal, AbortSignal.timeout(55_000)]);
  try {
    const response = await fetch(url, {
      method: "POST", signal: timedSignal,
      ...(body instanceof FormData ? { body } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    let data: unknown;
    try { data = await response.json(); }
    catch { throw new Error(response.status === 413 ? "写真は3MB以下にしてください。" : "サーバーからの返答を読み取れませんでした。時間を置いてお試しください。"); }
    if (!response.ok) {
      const error = z.object({ error: z.string().max(200), requestId: z.string().uuid().optional() }).safeParse(data);
      throw new Error(error.success ? `${error.data.error}${error.data.requestId ? `（お問い合わせ番号: ${error.data.requestId}）` : ""}` : "処理に失敗しました。時間を置いてお試しください。");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("受信データの形式が正しくありません。もう一度お試しください。");
    const payload = { ...data } as Record<string, unknown>;
    delete payload.requestId;
    const result = schema.safeParse(payload);
    if (!result.success) throw new Error("受信データの形式が正しくありません。もう一度お試しください。");
    return result.data;
  } catch (error) {
    if (signal.aborted) throw error;
    if (timedSignal.aborted) throw new Error("処理に時間がかかっています。少し待ってからお試しください。");
    if (error instanceof TypeError) throw new Error("通信できませんでした。インターネット接続を確認してください。");
    throw error;
  }
}
