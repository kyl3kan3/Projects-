/**
 * src/lib/payroll-export.ts
 *
 * Payroll CSV generation in ADP and Gusto formats. The core promise:
 * approved hours leave as a file the bookkeeper imports without
 * re-keying. Rendering via csv-stringify; formats pinned by golden-file
 * tests.
 *
 * TODO:
 * - [ ] Period close: lock approved entries, snapshot rates so a
 *       re-export months later reproduces the same file.
 * - [ ] Column maps as data, documented per format:
 *       ADP (RUN import): "Co Code", "Batch ID", "File #", "Reg Hours",
 *       "O/T Hours", "Pay Date" — exact header casing and order.
 *       Gusto (time import): "last_name", "first_name", "employee_email",
 *       "regular_hours", "overtime_hours" per Gusto's CSV template.
 * - [ ] OT calculation per state rules table (start with CA/TX/FL:
 *       weekly-40 and daily-8 variants) via computeOvertimeSplit.
 * - [ ] validateBeforeExport: block when any worker lacks a payroll
 *       mapping (ADP file number / Gusto email) or has unapproved
 *       flagged entries — fail loudly before payroll, never after.
 * - [ ] Export log with checksum on payroll_exports; export_line_items
 *       per worker for drill-down; re-export reproducibility test.
 * - [ ] emailExport(exportId, recipient): deliver via Resend.
 */

import type { ExportFormat } from "../db/schema";

export interface ExportRequest {
  organizationId: string;
  format: ExportFormat;
  periodStart: Date;
  periodEnd: Date;
  requestedBy: string;
}

export interface ExportResult {
  payrollExportId: string;
  rowCount: number;
  totalHours: number;
  fileKey: string;
  checksum: string;
}

export interface ExportValidationIssue {
  userId: string;
  problem: "missing_payroll_mapping" | "unapproved_entries" | "open_entry";
}

export function validateBeforeExport(
  _request: ExportRequest,
): Promise<ExportValidationIssue[]> {
  throw new Error("Not implemented");
}

export function generateExport(_request: ExportRequest): Promise<ExportResult> {
  throw new Error("Not implemented");
}
