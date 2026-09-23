"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { analysisSchema, recipesSchema, recipeInputSchema, imageFileError, type Recipe } from "@/lib/contracts";
import { postApi } from "@/lib/client-api";
import { RequestGate } from "@/lib/request-gate";
import IngredientEditor from "./components/ingredient-editor";
import SeasoningPantry from "./components/seasoning-pantry";
import { availableSeasonings, type PantryItem } from "@/lib/pantry";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [seasonings, setSeasonings] = useState<PantryItem[]>([]);
  const [analyzed, setAnalyzed] = useState(false);
  const [edited, setEdited] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [openRecipe, setOpenRecipe] = useState<number | null>(null);
  const [busy, setBusy] = useState<"analyze" | "recipes" | null>(null);
  const [error, setError] = useState("");
  const gate = useRef(new RequestGate());
  const preview = useRef<string | null>(null);
  const analyzing = busy === "analyze";
  const generating = busy === "recipes";
  const recipeInput = recipeInputSchema.safeParse({ ingredients, seasonings: availableSeasonings(seasonings) });
  const saveSeasonings = useCallback((items: PantryItem[]) => {
    gate.current.invalidate();
    setBusy(null); setSeasonings(items); setRecipes([]); setOpenRecipe(null); setError("");
  }, []);

  useEffect(() => {
    const requests = gate.current;
    return () => {
      requests.invalidate();
      if (preview.current) URL.revokeObjectURL(preview.current);
    };
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (!selected) return;
    gate.current.invalidate();
    setBusy(null);
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = null;
    setImage(null);
    setFile(null);
    setIngredients([]);
    setAnalyzed(false);
    setEdited(false);
    setRecipes([]);
    setOpenRecipe(null);
    const message = imageFileError(selected);
    setError(message || "");
    if (message) return;
    preview.current = URL.createObjectURL(selected);
    setImage(preview.current);
    setFile(selected);
  };

  const run = async (operation: "analyze" | "recipes") => {
    // Re-evaluate the date at submission, even if the page remained open overnight.
    const recipeInput = recipeInputSchema.safeParse({ ingredients, seasonings: availableSeasonings(seasonings) });
    // Also block rapid clicks before React renders the disabled buttons.
    if (operation === "analyze" && !file || operation === "recipes" && !ingredients.length) return;
    if (operation === "recipes" && !recipeInput.success) return;
    const ticket = gate.current.begin();
    if (!ticket) return;
    const controller = ticket.controller;
    setBusy(operation);
    setError("");
    setRecipes([]);
    setOpenRecipe(null);
    try {
      if (operation === "analyze") {
        setIngredients([]);
        setAnalyzed(false);
        setEdited(false);
        const form = new FormData();
        form.append("image", file!);
        const data = await postApi("/api/analyze", form, analysisSchema, controller.signal);
        if (!gate.current.isCurrent(ticket)) return;
        setIngredients(data.ingredients);
        setAnalyzed(true);
      } else {
        if (!recipeInput.success) return;
        const data = await postApi("/api/recipes", recipeInput.data, recipesSchema, controller.signal);
        if (!gate.current.isCurrent(ticket)) return;
        setRecipes(data.recipes);
      }
    } catch (err) {
      if (gate.current.isCurrent(ticket) && !controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "処理に失敗しました。もう一度お試しください。");
      }
    } finally {
      if (gate.current.finish(ticket)) {
        setBusy(null);
      }
    }
  };

  const editIngredients = (next: string[]) => {
    // Invalidate any old result as well as clearing recipes derived from the old list.
    gate.current.invalidate();
    setBusy(null);
    setIngredients(next);
    setEdited(true);
    setRecipes([]);
    setOpenRecipe(null);
    setError("");
  };

  const toggleRecipe = (index: number) => {
    setOpenRecipe(openRecipe === index ? null : index);
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">

        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900">
            ラクラクック
          </h1>

          <p className="mt-3 text-gray-600">
            冷蔵庫の写真から、今日の料理を考えます。
          </p>
        </div>

        <div className="mt-10 rounded-3xl bg-white p-6 shadow-sm sm:p-8">

          <label className="flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-gray-300 p-8 transition hover:bg-gray-50 focus-within:ring-2 focus-within:ring-green-600">

            <span className="text-5xl">📷</span>

            <span className="mt-4 font-medium text-gray-700">
              冷蔵庫や食材の写真を選択
            </span>

            <span className="mt-4 rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white">
              写真を選ぶ
            </span>

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp" aria-label="食材の写真"
              onChange={handleImageChange}
              className="sr-only"
            />
          </label>

          <p className="mt-3 text-sm text-gray-600">JPEG・PNG・WebP、3MB以下の写真を選んでください。</p>
          <p role="status" aria-live="polite" className="mt-3 text-sm text-gray-600">{busy ? "処理には数十秒かかることがあります。" : analyzed && !edited && !ingredients.length ? "食材を見つけられませんでした。下で食材を追加するか、別の写真でお試しください。" : ""}</p>

          {image && (
            <div className="mt-6">
              {/* Local blob preview: no remote image optimization is needed. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt="選択した食材"
                className="mx-auto max-h-96 rounded-2xl object-contain"
              />

              <button
                onClick={() => void run("analyze")}
                disabled={busy !== null}
                className="mt-6 w-full rounded-xl bg-green-600 px-5 py-4 font-bold text-white transition hover:bg-green-700 disabled:opacity-50"
              >
                {analyzing
                  ? "AIが食材を分析しています..."
                  : "食材を分析する"}
              </button>
            </div>
          )}

            <section aria-labelledby="ingredient-heading" className="mt-8 rounded-2xl bg-green-50 p-6">

              <h2 id="ingredient-heading" className="text-xl font-bold text-gray-900">
                🥕 料理に使う食材
              </h2>

              <IngredientEditor ingredients={ingredients} disabled={busy !== null} onChange={editIngredients} />
              {edited && <p className="mt-4 text-sm text-gray-700">入力・編集した食材で料理を提案します。</p>}

              <button
                onClick={() => void run("recipes")}
                disabled={busy !== null || !recipeInput.success}
                className="mt-6 w-full rounded-xl bg-orange-500 px-5 py-4 font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
              >
                {generating
                  ? "AIが料理を考えています..."
                  : "🍳 この食材から料理を考える"}
              </button>

            </section>

          <SeasoningPantry disabled={busy !== null} onSave={saveSeasonings} />

          {recipes.length > 0 && (
            <section className="mt-10">

              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  🍳 今日のおすすめ
                </h2>

                <p className="mt-2 text-sm text-gray-500">
                  気になる料理のレシピを見てみましょう。
                </p>
              </div>

              <div className="space-y-5">

                {recipes.map((recipe, index) => (
                  <div
                    key={index}
                    className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
                  >

                    <div className="p-6">

                      <div className="flex items-start justify-between gap-4">

                        <div>
                          <p className="text-sm font-semibold text-orange-500">
                            おすすめ {index + 1}
                          </p>

                          <h3 className="mt-1 text-xl font-bold text-gray-900">
                            {recipe.name}
                          </h3>

                          <p className="mt-2 text-sm text-gray-500">
                            ⏱ 調理時間 {recipe.time}
                          </p>
                        </div>

                        <span className="text-3xl">
                          🍽️
                        </span>

                      </div>

                      <div className="mt-4 rounded-xl bg-amber-50 p-4">
                        <h4 className="font-semibold text-gray-900">🛒 追加で必要な食材</h4>
                        {recipe.missingIngredients.length > 0 ? (
                          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-gray-800">
                            {recipe.missingIngredients.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-green-800">追加の食材はありません。</p>
                        )}
                        <p className="mt-2 text-xs text-gray-600">入力した食材・保存した調味料と比較しています。手元の分量は材料一覧で確認してください。</p>
                      </div>

                      <button
                        onClick={() => toggleRecipe(index)}
                        className="mt-5 w-full rounded-xl border border-orange-500 px-4 py-3 font-semibold text-orange-600 transition hover:bg-orange-50"
                      >
                        {openRecipe === index
                          ? "レシピを閉じる"
                          : "レシピを見る"}
                      </button>

                    </div>

                    {openRecipe === index && (
                      <div className="border-t border-gray-100 bg-orange-50/50 p-6">

                        <div>
                          <h4 className="text-lg font-bold text-gray-900">
                            🥬 材料
                          </h4>

                          <ul className="mt-3 space-y-2">
                            {recipe.ingredients.map(
                              (ingredient, ingredientIndex) => (
                                <li
                                  key={ingredientIndex}
                                  className="rounded-lg bg-white px-4 py-2 text-gray-700"
                                >
                                  {ingredient}
                                </li>
                              )
                            )}
                          </ul>
                        </div>

                        <div className="mt-7">
                          <h4 className="text-lg font-bold text-gray-900">
                            👨‍🍳 作り方
                          </h4>

                          <ol className="mt-4 space-y-4">

                            {recipe.steps.map((step, stepIndex) => (
                              <li
                                key={stepIndex}
                                className="flex gap-3"
                              >

                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white">
                                  {stepIndex + 1}
                                </span>

                                <p className="pt-0.5 leading-7 text-gray-700">
                                  {step}
                                </p>

                              </li>
                            ))}

                          </ol>
                        </div>

                      </div>
                    )}

                  </div>
                ))}

              </div>
            </section>
          )}

          {error && (
            <div role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}

        </div>
      </div>
    </main>
  );
}
