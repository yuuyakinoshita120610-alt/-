import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { ingredients } = await request.json();

    if (!ingredients) {
      return NextResponse.json(
        { error: "食材がありません。" },
        { status: 400 }
      );
    }

    const response = await openai.responses.create({
      model: "gpt-5-mini",

      input: `
あなたは家庭料理のレシピ提案アシスタントです。

次の食材をできるだけ活用して、
家庭で簡単に作れる料理を3つ提案してください。

食材：
${ingredients}

塩、こしょう、醤油、砂糖、油など、
一般家庭にある基本的な調味料は使用して構いません。

必ずJSONだけを返してください。
説明文やMarkdownは付けないでください。

次の形式にしてください。

{
  "recipes": [
    {
      "name": "料理名",
      "time": "15分",
      "ingredients": [
        "豚肉 200g",
        "キャベツ 1/4個"
      ],
      "steps": [
        "キャベツを食べやすい大きさに切る",
        "フライパンで豚肉を炒める",
        "キャベツを加えて炒める"
      ]
    }
  ]
}
`,
    });

    const text = response.output_text.trim();

    const cleanedText = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const data = JSON.parse(cleanedText);

    return NextResponse.json(data);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "レシピの生成に失敗しました。" },
      { status: 500 }
    );
  }
}