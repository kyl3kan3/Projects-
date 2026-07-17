/**
 * POST /api/enrollments
 *
 * The portal's enrollment endpoint: zod body { studentId, classId } ->
 * lib/enrollment.enroll inside the family's session. Errors return the
 * EnrollmentError sentence verbatim for inline rendering.
 *
 * DELETE /api/enrollments?id= — drop (frees the seat, worker promotes).
 *
 * TODO: requireFamily(); ownership checks (student belongs to family).
 */

export async function POST(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}

export async function DELETE(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}
