import sharp from "sharp";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, recipeInputSchema } from "../contracts";
import { AppError } from "./errors";

// Count actual streamed bytes: Content-Length alone is not trustworthy.
export async function readLimited(request: Request, max: number): Promise<Uint8Array<ArrayBuffer>> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > max) throw new AppError(413, "TOO_LARGE", "送信データが大きすぎます。写真は3MB以下にしてください。");
  if (!request.body) throw new AppError(400, "EMPTY_BODY", "送信データがありません。");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let expired = false;
  const timeout = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, 10_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (expired) throw new AppError(408, "UPLOAD_TIMEOUT", "送信に時間がかかっています。もう一度お試しください。");
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        void reader.cancel().catch(() => {});
        throw new AppError(413, "TOO_LARGE", "送信データが大きすぎます。写真は3MB以下にしてください。");
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function readIngredients(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new AppError(415, "CONTENT_TYPE", "食材データの形式が正しくありません。");
  }
  const bytes = await readLimited(request, 16 * 1024);
  let json: unknown;
  try { json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new AppError(400, "INVALID_JSON", "食材データを読み取れませんでした。"); }
  const result = recipeInputSchema.safeParse(json);
  if (!result.success) throw new AppError(400, "INVALID_INGREDIENTS", "食材を1〜30個、各80文字以内で指定してください。");
  return [...new Set([...result.data.ingredients, ...(result.data.seasonings || [])])];
}

export async function readImage(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new AppError(415, "CONTENT_TYPE", "画像の送信形式が正しくありません。");
  }
  const bytes = await readLimited(request, MAX_IMAGE_BYTES + 64 * 1024);
  let form: FormData;
  try { form = await new Response(bytes, { headers: { "content-type": contentType } }).formData(); }
  catch { throw new AppError(400, "INVALID_FORM", "画像データを読み取れませんでした。"); }
  const image = form.get("image");
  if (!(image instanceof File) || form.getAll("image").length !== 1 || [...form.keys()].some(key => key !== "image")) {
    throw new AppError(400, "MISSING_IMAGE", "写真を1枚選んでください。");
  }
  if (!image.size) throw new AppError(400, "EMPTY_IMAGE", "空の画像は使用できません。");
  if (image.size > MAX_IMAGE_BYTES) throw new AppError(413, "TOO_LARGE", "写真は3MB以下にしてください。");
  if (!IMAGE_TYPES.includes(image.type)) throw new AppError(415, "IMAGE_TYPE", "JPEG・PNG・WebPの写真を選んでください。");
  try {
    const buffer = Buffer.from(await image.arrayBuffer());
    const options = { limitInputPixels: 25_000_000, failOn: "warning" as const };
    const metadata = await sharp(buffer, options).metadata();
    const types: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
    if (types[metadata.format || ""] !== image.type || (metadata.pages || 1) > 1) throw Error();
    // Decode/re-encode, strip metadata, and bound the image sent to the model.
    const normalized = await sharp(buffer, options).rotate().resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    return `data:image/jpeg;base64,${normalized.toString("base64")}`;
  } catch {
    throw new AppError(415, "INVALID_IMAGE", "画像を読み取れません。静止画のJPEG・PNG・WebP（2500万画素以下）を選んでください。");
  }
}
