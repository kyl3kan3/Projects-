import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { env } from "@/lib/env";

export async function POST() {
  await clearSession();
  return NextResponse.redirect(new URL("/login", env.appUrl), { status: 303 });
}
