import { NextResponse } from "next/server";
import { scanExpiringCards } from "@/lib/pre-dunning";

export async function GET() {
  return NextResponse.json(await scanExpiringCards());
}

export async function POST() {
  return NextResponse.json(await scanExpiringCards());
}
