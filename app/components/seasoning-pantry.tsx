"use client";
import { useEffect, useState } from "react";
import { SEASONINGS, pantryStorage, expiryStatus, localDate, type PantryItem } from "@/lib/pantry";

export default function SeasoningPantry({ disabled, onSave }: { disabled: boolean; onSave: (items: PantryItem[]) => void }) {
  const [selected, setSelected] = useState<PantryItem[]>([]);
  const [today, setToday] = useState("");
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setToday(localDate());
      try {
        const saved = pantryStorage.load();
        setSelected(saved); onSave(saved);
      } catch { setMessage("保存済みの調味料を読み込めませんでした。選び直して保存してください。"); }
      setReady(true);
    });
    const timer = setInterval(() => setToday(localDate()), 60000);
    return () => { active = false; clearInterval(timer); };
  }, [onSave]);
  const save = () => {
    try {
      pantryStorage.save(selected); onSave(selected); setDirty(false);
      setMessage("保存しました。次の料理提案に使います。");
    } catch { setMessage("保存できませんでした。ブラウザの保存設定を確認してください。変更は反映されていません。"); }
  };
  return <section aria-labelledby="pantry-heading" className="mt-8 rounded-2xl border border-green-200 bg-white p-5">
    <h2 id="pantry-heading" className="text-xl font-bold text-gray-900">🧂 家にある調味料</h2>
    <p className="mt-2 text-sm text-gray-600">保存した調味料は、手元にあるものとして料理提案に使います。このブラウザに保存され、他の端末とは共有されません。</p>
    <p className="mt-2 text-sm text-gray-600">賞味期限は任意です。期限切れは料理提案から除外し、未登録は手元にあるものとして扱います。開封後は商品の保存方法・使用目安も確認してください。</p>
    <fieldset disabled={disabled || !ready} className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <legend className="sr-only">家にある調味料を選択</legend>
      {SEASONINGS.map(item => <div key={item} className="min-w-0 rounded-lg bg-gray-50 p-3 text-sm text-gray-900">
        <label className="flex min-h-8 cursor-pointer items-center gap-2"><input type="checkbox" checked={selected.some(value => value.name === item)} onChange={e => {
          setSelected(current => e.target.checked ? [...current, { name: item, bestBefore: "" }] : current.filter(value => value.name !== item));
          setDirty(true); setMessage("");
        }} className="h-4 w-4 accent-green-700" />{item}</label>
        {selected.filter(value => value.name === item).map(value => <div key={value.name} className="mt-2">
          <label className="block text-xs">賞味期限
            <input type="date" aria-label={`${item}の賞味期限`} min="0001-01-01" max="9999-12-31" value={value.bestBefore} onChange={e => {
              const bestBefore = e.target.value;
              setSelected(current => current.map(entry => entry.name === item ? { ...entry, bestBefore } : entry));
              setDirty(true); setMessage("");
            }} className="mt-1 block w-full min-w-0 rounded border border-gray-300 bg-white p-2 text-sm" />
          </label>
          <p className={`mt-2 text-xs font-semibold ${expiryStatus(value.bestBefore, today) === "期限切れ" ? "text-red-700" : "text-amber-800"}`}>{expiryStatus(value.bestBefore, today)}</p>
        </div>)}
      </div>)}
    </fieldset>
    <button type="button" disabled={disabled || !ready || !dirty} onClick={save} className="mt-4 rounded-xl bg-green-700 px-5 py-3 font-semibold text-white disabled:opacity-50">調味料を保存</button>
    <p role="status" className="mt-2 text-sm text-gray-700">{message || (dirty ? "変更は未保存です。「調味料を保存」を押して反映してください。" : "")}</p>
  </section>;
}
