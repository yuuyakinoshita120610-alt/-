// Replace this adapter with account-backed storage when subscriptions are introduced.
export const SEASONINGS = ["塩", "砂糖", "醤油", "味噌", "酢", "みりん", "料理酒", "こしょう", "サラダ油", "ごま油", "オリーブ油", "バター", "マヨネーズ", "ケチャップ", "ウスターソース", "めんつゆ", "和風だし", "鶏がらスープの素", "コンソメ", "片栗粉"] as const;
export type Seasoning = typeof SEASONINGS[number];
const STORAGE_KEY = "rakuracook.pantry.v1";
export function parsePantry(raw: string | null): Seasoning[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some(item => !SEASONINGS.includes(item))) throw new Error("Invalid pantry");
  return SEASONINGS.filter(item => value.includes(item));
}
export const pantryStorage = {
  load: () => parsePantry(localStorage.getItem(STORAGE_KEY)),
  save: (items: Seasoning[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(items)),
};
