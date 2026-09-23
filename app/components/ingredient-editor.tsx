"use client";

import { useRef } from "react";

type Props = {
  ingredients: string[];
  disabled: boolean;
  onChange: (ingredients: string[]) => void;
};

export default function IngredientEditor({ ingredients, disabled, onChange }: Props) {
  const fields = useRef<Array<HTMLInputElement | null>>([]);
  const addButton = useRef<HTMLButtonElement | null>(null);

  const add = () => {
    if (disabled || ingredients.length >= 30) return;
    const index = ingredients.length;
    onChange([...ingredients, ""]);
    requestAnimationFrame(() => fields.current[index]?.focus());
  };

  const remove = (index: number) => {
    if (disabled) return;
    onChange(ingredients.filter((_, current) => current !== index));
    requestAnimationFrame(() => {
      const next = fields.current[Math.min(index, ingredients.length - 2)];
      if (next) next.focus();
      else addButton.current?.focus();
    });
  };

  return (
    <fieldset disabled={disabled} aria-describedby="ingredient-help" className="mt-4 min-w-0">
      <legend className="sr-only">料理に使う食材の編集</legend>
      <p id="ingredient-help" className="text-sm leading-6 text-gray-700">
        食材名はそのまま書き換えられます。足りない食材を追加し、使わないものは削除してください。写真なしでも入力できます。
      </p>
      {ingredients.length === 0 && (
        <p className="mt-4 text-sm text-gray-600">食材がまだありません。「食材を追加」から入力してください。</p>
      )}
      <ul className="mt-4 space-y-3">
        {ingredients.map((ingredient, index) => {
          const empty = !ingredient.trim();
          return (
            <li key={index}>
              <label htmlFor={`ingredient-${index}`} className="mb-1 block text-sm font-medium text-gray-700">食材 {index + 1}</label>
              <div className="flex items-start gap-2">
                <input
                  ref={element => { fields.current[index] = element; }}
                  id={`ingredient-${index}`}
                  type="text"
                  value={ingredient}
                  maxLength={80}
                  placeholder="例：白菜"
                  aria-invalid={empty}
                  aria-describedby={empty ? `ingredient-error-${index}` : undefined}
                  onChange={event => onChange(ingredients.map((value, current) => current === index ? event.target.value : value))}
                  className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-3 py-3 text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600 disabled:opacity-60"
                />
                <button
                  type="button"
                  aria-label={`食材 ${index + 1}を削除`}
                  onClick={() => remove(index)}
                  className="shrink-0 rounded-xl border border-gray-300 bg-white px-3 py-3 text-gray-700 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-green-600 disabled:opacity-60"
                >削除</button>
              </div>
              {empty && <p id={`ingredient-error-${index}`} className="mt-1 text-sm text-red-700">食材名を入力するか、この行を削除してください。</p>}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          ref={addButton}
          type="button"
          onClick={add}
          disabled={disabled || ingredients.length >= 30}
          className="rounded-xl border border-green-600 bg-white px-4 py-3 font-semibold text-green-800 hover:bg-green-100 focus-visible:ring-2 focus-visible:ring-green-600 disabled:opacity-50"
        >＋ 食材を追加</button>
        <p className="text-sm text-gray-600" role="status">{ingredients.length} / 30個（1つ80文字まで）</p>
      </div>
      {ingredients.length >= 30 && <p className="mt-2 text-sm text-gray-600">食材は30個までです。追加するには不要な食材を削除してください。</p>}
    </fieldset>
  );
}
