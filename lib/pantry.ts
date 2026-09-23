// Replace this adapter with account-backed storage when subscriptions are introduced.
export const SEASONINGS = ["塩", "砂糖", "醤油", "味噌", "酢", "みりん", "料理酒", "こしょう", "サラダ油", "ごま油", "オリーブ油", "バター", "マヨネーズ", "ケチャップ", "ウスターソース", "めんつゆ", "和風だし", "鶏がらスープの素", "コンソメ", "片栗粉"] as const;
export type Seasoning = typeof SEASONINGS[number];
export type PantryItem = { name: Seasoning; bestBefore: string };
export function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function expiryStatus(value: string, today = localDate()) {
  if (!value) return "未登録";
  if (value < today) return "期限切れ";
  const days = (Date.parse(`${value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  return days === 0 ? "本日まで" : days <= 7 ? "7日以内" : "期限内";
}
export function availableSeasonings(items: PantryItem[], today = localDate()): Seasoning[] {
  return items.filter(item => !item.bestBefore || item.bestBefore >= today).map(item => item.name);
}
const STORAGE_KEY = "rakuracook.pantry.v1";
export function parsePantry(raw: string | null): Seasoning[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some(item => !SEASONINGS.includes(item))) throw new Error("Invalid pantry");
  return SEASONINGS.filter(item => value.includes(item));
}
export const pantryStorage = {
  load: (): PantryItem[] => {
    const raw = localStorage.getItem("rakuracook.pantry.v2");
    return raw === null ? parsePantry(localStorage.getItem(STORAGE_KEY)).map(name => ({ name, bestBefore: "" })) : parseDatedPantry(raw);
  },
  save: (items: PantryItem[]) => {
    const checked = parseDatedPantry(JSON.stringify(items));
    localStorage.setItem("rakuracook.pantry.v2", JSON.stringify(checked));
  },
};
export function parseDatedPantry(raw: string): PantryItem[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > SEASONINGS.length || value.some(item =>
    !item || !SEASONINGS.includes(item.name) || typeof item.bestBefore !== "string" || item.bestBefore !== "" && !validDate(item.bestBefore)
  ) || new Set(value.map(item => item.name)).size !== value.length) throw new Error("Invalid pantry");
  return value.map(item => ({ name: item.name, bestBefore: item.bestBefore }));
}
