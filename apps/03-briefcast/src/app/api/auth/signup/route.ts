import { NextResponse } from "next/server";
import { z } from "zod";
import { signUp } from "@/lib/auth";
import { seedDemoMeeting } from "@/lib/seed";

const Body = z.object({
  name: z.string().min(1).max(120),
  orgName: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const { user, org } = await signUp(parsed.data.name, parsed.data.orgName, parsed.data.email, parsed.data.password);
    await seedDemoMeeting(org.id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sign-up failed" }, { status: 400 });
  }
}
