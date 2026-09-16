import { NextResponse } from "next/server";
import { ACCESS_COOKIE_MAX_AGE, ACCESS_COOKIE_NAME, accessCookieValue, secretsEqual } from "@/lib/access-gate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const configuredPasscode = process.env.APP_ACCESS_PASSCODE;
  const cookieSecret = process.env.APP_ACCESS_COOKIE_SECRET;
  if (!configuredPasscode || !cookieSecret) return NextResponse.json({ error: "Kodi i aksesit nuk është konfiguruar në server." }, { status: 503 });
  const body = await request.json().catch(() => null) as { passcode?: unknown } | null;
  const passcode = typeof body?.passcode === "string" ? body.passcode : "";
  if (!passcode || !(await secretsEqual(passcode, configuredPasscode))) {
    return NextResponse.json({ error: "Kodi nuk është i saktë." }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const response = NextResponse.json({ accepted: true });
  response.cookies.set(ACCESS_COOKIE_NAME, await accessCookieValue(cookieSecret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ accepted: true });
  response.cookies.set(ACCESS_COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
