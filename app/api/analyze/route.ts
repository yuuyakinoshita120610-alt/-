import { handle } from "@/lib/server/handler";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handle(request, "analyze");
}
