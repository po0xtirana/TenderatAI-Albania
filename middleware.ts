import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  if (process.env.DATA_BACKEND !== "supabase") return NextResponse.next();
  if (process.env.PASSWORDLESS_MODE === "1") {
    const configuredToken = process.env.APP_LINK_TOKEN;
    if (!configuredToken) return NextResponse.next();
    const cookieName = "tenderat_company_access";
    if (request.cookies.get(cookieName)?.value === configuredToken) return NextResponse.next();
    if (request.nextUrl.searchParams.get("access") === configuredToken) {
      const cleanUrl = new URL(request.url);
      cleanUrl.searchParams.delete("access");
      const response = NextResponse.redirect(cleanUrl);
      response.cookies.set(cookieName, configuredToken, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 365 });
      return response;
    }
    if (request.nextUrl.pathname === "/api/health") return NextResponse.next();
    if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Linku privat i kompanisë nuk është i vlefshëm." }, { status: 403 });
    return new NextResponse("Linku privat i kompanisë nuk është i vlefshëm.", { status: 403 });
  }
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase nuk është konfiguruar." }, { status: 503 });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        for (const { name, value, options } of values) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      }
    }
  });
  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const publicPath = pathname === "/login" || pathname.startsWith("/auth/") || pathname === "/api/health";
  if (!user && !publicPath) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Duhet të identifikoheni." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
