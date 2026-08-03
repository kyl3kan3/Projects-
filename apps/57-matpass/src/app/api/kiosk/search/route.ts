/**
 * Kiosk search: three letters of a name, or a PIN.
 *
 * Device-token authenticated like the write path, and the projection is
 * deliberately narrow — name, belt state, today's classes. No birthdate, no
 * guardian contact, no billing state ever leaves this endpoint (minors' data
 * discipline, README risk 6).
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { searchStudents, verifyDeviceToken } from "@/lib/kiosk";

export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().min(10),
  query: z.string().max(60),
});

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const device = await verifyDeviceToken(parsed.token);
  if (!device) {
    return NextResponse.json({ error: "device is not active" }, { status: 403 });
  }

  const students = await searchStudents({
    schoolId: device.schoolId,
    query: parsed.query,
    timezone: device.timezone,
  });

  return NextResponse.json({
    students: students.map((student) => ({
      studentId: student.studentId,
      name: student.name,
      enrollments: student.enrollments.map((enrollment) => ({
        enrollmentId: enrollment.enrollmentId,
        programName: enrollment.programName,
        rankName: enrollment.rankName,
        beltColorHex: enrollment.beltColorHex,
        stripesEarned: enrollment.stripesEarned,
        stripesTotal: enrollment.stripesTotal,
        classesDone: enrollment.progress.classesDone,
        classesRequired: enrollment.progress.classesRequired,
        eligible: enrollment.progress.eligible,
        classes: enrollment.classes,
        preselectedClassId: enrollment.preselectedClassId,
      })),
    })),
  });
}
