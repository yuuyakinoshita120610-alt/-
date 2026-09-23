import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json(
        { error: "画像がありません。" },
        { status: 400 }
      );
    }

    const bytes = await image.arrayBuffer();
    const base64Image = Buffer.from(bytes).toString("base64");

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `この写真に写っている食材を確認してください。
料理に使用できる食材だけを、日本語で簡潔に列挙してください。
調味料、食器、調理器具は除外してください。`,
            },
            {
              type: "input_image",
              image_url: `data:${image.type};base64,${base64Image}`,
              detail: "low",
            },
          ],
        },
      ],
    });

    return NextResponse.json({
      ingredients: response.output_text,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "食材の分析に失敗しました。" },
      { status: 500 }
    );
  }
}