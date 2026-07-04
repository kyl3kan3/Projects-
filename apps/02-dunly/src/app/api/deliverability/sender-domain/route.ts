import { NextRequest, NextResponse } from "next/server";
import { getSenderDomainSetup } from "@/lib/deliverability";

export function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain") ?? "recover.northstarbilling.com";
  return NextResponse.json(getSenderDomainSetup(domain));
}
