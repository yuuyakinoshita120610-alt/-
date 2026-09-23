"use client";
import { useEffect, useState } from "react";
import { SEASONINGS, pantryStorage, type Seasoning } from "@/lib/pantry";

export default function SeasoningPantry({ disabled, onSave }: { disabled: boolean; onSave: (items: Seasoning[]) => void }) {
  const [selected, setSelected] = useState<Seasoning[]>([]);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      try {
        const saved = pantryStorage.load();
        setSelected(saved); onSave(saved);
      } catch { setMessage("保存済みの調味料を読み込めませんでした。選び直して保存してください。"); }
      setReady(true);
    });
    return () => { active = false; };
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
    <fieldset disabled={disabled || !ready} className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <legend className="sr-only">家にある調味料を選択</legend>
      {SEASONINGS.map(item => <label key={item} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-900">
        <input type="checkbox" checked={selected.includes(item)} onChange={e => {
          setSelected(current => e.target.checked ? [...current, item] : current.filter(value => value !== item));
          setDirty(true); setMessage("");
        }} className="h-4 w-4 accent-green-700" />{item}
      </label>)}
    </fieldset>
    <button type="button" disabled={disabled || !ready || !dirty} onClick={save} className="mt-4 rounded-xl bg-green-700 px-5 py-3 font-semibold text-white disabled:opacity-50">調味料を保存</button>
    <p role="status" className="mt-2 text-sm text-gray-700">{message || (dirty ? "変更は未保存です。「調味料を保存」を押して反映してください。" : "")}</p>
  </section>;
}
