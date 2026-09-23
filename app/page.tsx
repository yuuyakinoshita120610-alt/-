"use client";

import { useState } from "react";

type Recipe = {
  name: string;
  time: string;
  ingredients: string[];
  steps: string[];
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState("");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [openRecipe, setOpenRecipe] = useState<number | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const handleImageChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFile = e.target.files?.[0];

    if (!selectedFile) return;

    setFile(selectedFile);
    setImage(URL.createObjectURL(selectedFile));
    setIngredients("");
    setRecipes([]);
    setOpenRecipe(null);
    setError("");
  };

  const analyzeImage = async () => {
    if (!file) return;

    try {
      setAnalyzing(true);
      setError("");
      setIngredients("");
      setRecipes([]);

      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "分析に失敗しました。");
      }

      setIngredients(data.ingredients);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "分析に失敗しました。"
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const generateRecipes = async () => {
    if (!ingredients) return;

    try {
      setGenerating(true);
      setError("");
      setRecipes([]);
      setOpenRecipe(null);

      const response = await fetch("/api/recipes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ingredients }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "レシピの生成に失敗しました。"
        );
      }

      setRecipes(data.recipes);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "レシピの生成に失敗しました。"
      );
    } finally {
      setGenerating(false);
    }
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

          <label className="flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-gray-300 p-8 transition hover:bg-gray-50">

            <span className="text-5xl">📷</span>

            <span className="mt-4 font-medium text-gray-700">
              冷蔵庫や食材の写真を選択
            </span>

            <span className="mt-4 rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white">
              写真を選ぶ
            </span>

            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />
          </label>

          {image && (
            <div className="mt-6">
              <img
                src={image}
                alt="選択した食材"
                className="mx-auto max-h-96 rounded-2xl object-contain"
              />

              <button
                onClick={analyzeImage}
                disabled={analyzing}
                className="mt-6 w-full rounded-xl bg-green-600 px-5 py-4 font-bold text-white transition hover:bg-green-700 disabled:opacity-50"
              >
                {analyzing
                  ? "AIが食材を分析しています..."
                  : "食材を分析する"}
              </button>
            </div>
          )}

          {ingredients && (
            <section className="mt-8 rounded-2xl bg-green-50 p-6">

              <h2 className="text-xl font-bold text-gray-900">
                🥕 見つかった食材
              </h2>

              <p className="mt-4 whitespace-pre-line leading-7 text-gray-700">
                {ingredients}
              </p>

              <button
                onClick={generateRecipes}
                disabled={generating}
                className="mt-6 w-full rounded-xl bg-orange-500 px-5 py-4 font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
              >
                {generating
                  ? "AIが料理を考えています..."
                  : "🍳 この食材から料理を考える"}
              </button>

            </section>
          )}

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
            <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}

        </div>
      </div>
    </main>
  );
}