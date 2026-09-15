import { NextResponse } from "next/server";
import { readSnapshot, removeBulletinData } from "@/lib/data";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const bulletin = (await readSnapshot()).bulletins.find((item) => item.id === id);
  if (!bulletin) return NextResponse.json({ error: "Buletini nuk u gjet." }, { status: 404 });
  if (["queued", "processing"].includes(bulletin.status)) {
    return NextResponse.json({ error: "Prisni që analizimi të përfundojë para se ta hiqni buletinin." }, { status: 409 });
  }
  try {
    const removed = await removeBulletinData(id);
    return NextResponse.json({ removed: Boolean(removed), bulletinId: id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Buletini nuk mund të hiqej." }, { status: 500 });
  }
}
