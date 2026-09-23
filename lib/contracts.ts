import { z } from "zod";

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ingredient = z.string().trim().min(1).max(80);
export const analysisSchema = z.object({
  ingredients: z.array(ingredient).max(30),
}).strict();
export const recipeInputSchema = z.object({
  ingredients: z.array(ingredient).min(1).max(30),
}).strict();
export const recipesSchema = z.object({
  recipes: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    time: z.string().trim().min(1).max(40),
    ingredients: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
    steps: z.array(z.string().trim().min(1).max(400)).min(1).max(12),
  }).strict()).length(3),
}).strict();
export type Recipe = z.infer<typeof recipesSchema>["recipes"][number];

export function imageFileError(file: Pick<File, "size" | "type">): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return "JPEG・PNG・WebPの写真を選んでください。";
  if (file.size === 0) return "空の画像は使用できません。";
  if (file.size > MAX_IMAGE_BYTES) return "写真は3MB以下にしてください。";
  return null;
}
