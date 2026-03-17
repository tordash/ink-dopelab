import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    // Google Apps Script web app endpoint (Google Sheet backend)
    const SCRIPT_URL = process.env.NEWSLETTER_SCRIPT_URL;

    if (SCRIPT_URL) {
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "ink-blog", date: new Date().toISOString() }),
      });
      if (!res.ok) {
        return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
