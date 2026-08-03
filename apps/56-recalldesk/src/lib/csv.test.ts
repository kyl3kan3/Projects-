import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, parseRoster, readHeaders, toCsv } from "@/lib/csv";
import { suggestMapping } from "@/lib/pms";
import { toDayString } from "@/lib/dates";

const TODAY = new Date("2026-08-03T12:00:00Z");

const DENTRIX = [
  "Pat Chart #,First Name,Last Name,Email,Home Phone,Mobile Phone,Last Visit Date,Continuing Care Interval",
  "AC1041,Rosalind,Mbeki,r.mbeki@example.com,512-555-0100,(512) 555-0147,11/14/2024,0006",
  "AC1042,Desmond,Okafor,d.okafor@example.com,,512-555-0163,02/03/2025,0006",
  "AC1043,Marguerite,Bellweather,,512-555-0188 x12,,08/22/2023,0004",
].join("\n");

test("a Dentrix-shaped file parses into patients with visits", () => {
  const { headers } = readHeaders(DENTRIX);
  const mapping = suggestMapping(headers, "dentrix");
  const r = parseRoster(DENTRIX, mapping, "dentrix", TODAY);

  assert.equal(r.rowCount, 3);
  assert.equal(r.patients.length, 3);

  const ros = r.patients[0];
  assert.equal(ros.externalId, "AC1041");
  assert.equal(ros.firstName, "Rosalind");
  assert.equal(ros.lastName, "Mbeki");
  assert.equal(ros.email, "r.mbeki@example.com");
  assert.equal(ros.phone, "+15125550147");
  assert.equal(ros.recallIntervalMonths, 6);
  assert.equal(ros.visits.length, 1);
  assert.equal(toDayString(ros.visits[0].visitedOn), "2024-11-14");

  // An extension-bearing number is refused rather than guessed at.
  const marg = r.patients[2];
  assert.equal(marg.phone, null);
  assert.equal(marg.email, null);
  assert.equal(marg.recallIntervalMonths, 4);
});

test("tab-delimited Eaglesoft exports with 'Last, First' names parse", () => {
  const file = [
    "Account\tPatient Name\tEmail\tCell Phone\tLast Visit\tRecall Interval",
    'ES-88\t"Mbeki, Rosalind"\tr.mbeki@example.com\t512-555-0147\t11/14/2024\t6',
    'ES-91\t"Okafor, Desmond"\t\t512-555-0163\t3/2/2025\t6',
  ].join("\n");
  const { headers, delimiter } = readHeaders(file);
  assert.equal(delimiter, "\t");
  const r = parseRoster(file, suggestMapping(headers, "eaglesoft"), "eaglesoft", TODAY);
  assert.equal(r.patients.length, 2);
  assert.equal(r.patients[0].firstName, "Rosalind");
  assert.equal(r.patients[0].lastName, "Mbeki");
  assert.equal(toDayString(r.patients[1].visits[0].visitedOn), "2025-03-02");
});

test("Open Dental's one-row-per-appointment export groups by chart id", () => {
  const file = [
    "PatNum,FName,LName,Email,WirelessPhone,AptDateTime,AptType",
    "5501,Rosalind,Mbeki,r.mbeki@example.com,5125550147,2024-05-14 09:00:00,Prophy Adult",
    "5501,Rosalind,Mbeki,,,2024-11-14 09:00:00,Prophy Adult",
    "5501,Rosalind,Mbeki,,,2025-01-08 14:30:00,Crown Prep",
    "5502,Desmond,Okafor,d.okafor@example.com,5125550163,2026-08-19 10:00:00,Prophy Adult",
  ].join("\n");
  const { headers } = readHeaders(file);
  const r = parseRoster(file, suggestMapping(headers, "opendental"), "opendental", TODAY);

  assert.equal(r.rowCount, 4);
  assert.equal(r.patients.length, 2);

  const ros = r.patients[0];
  assert.equal(ros.visits.length, 3);
  // Contact details from the first row are not lost when later rows are blank.
  assert.equal(ros.email, "r.mbeki@example.com");
  assert.equal(ros.phone, "+15125550147");
  // The crown is not a hygiene visit.
  assert.deepEqual(
    ros.visits.map((v) => `${toDayString(v.visitedOn)}:${v.kind}`),
    ["2024-05-14:hygiene", "2024-11-14:hygiene", "2025-01-08:other"],
  );

  // A future appointment is kept, and reported as an anomaly.
  assert.equal(r.patients[1].visits.length, 1);
  assert.ok(r.anomalies.some((a) => a.code === "future_appointments"));
  assert.ok(r.anomalies.some((a) => a.code === "merged_rows"));
});

test("duplicate appointment rows collapse", () => {
  const file = [
    "PatNum,FName,LName,AptDateTime,AptType",
    "1,Ada,Nwosu,2025-02-10,Prophy",
    "1,Ada,Nwosu,2025-02-10,Prophy",
  ].join("\n");
  const { headers } = readHeaders(file);
  const r = parseRoster(file, suggestMapping(headers, "opendental"), "opendental", TODAY);
  assert.equal(r.patients.length, 1);
  assert.equal(r.patients[0].visits.length, 1);
});

test("patients without a chart id are keyed on name plus a contact detail", () => {
  const file = [
    "Name,Email,Phone,Last Visit",
    "John Smith,j.smith@example.com,512-555-0111,01/10/2025",
    "John Smith,jsmith2@example.com,512-555-0222,02/11/2025",
    "John Smith,j.smith@example.com,512-555-0111,06/12/2025",
  ].join("\n");
  const { headers } = readHeaders(file);
  const r = parseRoster(file, suggestMapping(headers, "other"), "other", TODAY);
  // Two different Smiths, and the first one's two visits merged.
  assert.equal(r.patients.length, 2);
  assert.equal(r.patients[0].visits.length, 2);
});

test("a row with no name is skipped and counted", () => {
  const file = [
    "First Name,Last Name,Last Visit",
    "Rosalind,Mbeki,11/14/2024",
    ",,01/01/2025",
  ].join("\n");
  const { headers } = readHeaders(file);
  const r = parseRoster(file, suggestMapping(headers, "other"), "other", TODAY);
  assert.equal(r.patients.length, 1);
  assert.equal(r.skippedRows, 1);
  assert.ok(r.anomalies.some((a) => a.code === "skipped_rows"));
});

test("a mostly-missing phone column is flagged with its percentage", () => {
  const rows = ["First Name,Last Name,Mobile Phone,Last Visit"];
  for (let i = 0; i < 10; i++) {
    rows.push(`Pat${i},Test,${i < 3 ? "512-555-01" + String(10 + i) : ""},01/10/2025`);
  }
  const file = rows.join("\n");
  const { headers } = readHeaders(file);
  const r = parseRoster(file, suggestMapping(headers, "other"), "other", TODAY);
  const anomaly = r.anomalies.find((a) => a.code === "missing_phone");
  assert.ok(anomaly);
  assert.match(anomaly.message, /70% of patients have no usable mobile number/);
  assert.equal(anomaly.severity, "warn");
});

test("unreadable dates are counted, not silently dropped", () => {
  const file = [
    "First Name,Last Name,Last Visit",
    "Rosalind,Mbeki,not a date",
    "Desmond,Okafor,11/14/2024",
  ].join("\n");
  const { headers } = readHeaders(file);
  const r = parseRoster(file, suggestMapping(headers, "other"), "other", TODAY);
  assert.ok(r.anomalies.some((a) => a.code === "unparseable_dates"));
  assert.equal(r.patients[0].visits.length, 0);
});

test("an empty consent column means 'no', a missing one means 'unchanged'", () => {
  const withColumn = [
    "First Name,Last Name,Last Visit,Text OK",
    "Rosalind,Mbeki,11/14/2024,Y",
    "Desmond,Okafor,11/14/2024,",
  ].join("\n");
  const h1 = readHeaders(withColumn).headers;
  const r1 = parseRoster(withColumn, suggestMapping(h1, "other"), "other", TODAY);
  assert.equal(r1.patients[0].smsConsent, true);
  assert.equal(r1.patients[1].smsConsent, false);

  const withoutColumn = ["First Name,Last Name,Last Visit", "Rosalind,Mbeki,11/14/2024"].join("\n");
  const h2 = readHeaders(withoutColumn).headers;
  const r2 = parseRoster(withoutColumn, suggestMapping(h2, "other"), "other", TODAY);
  assert.equal(r2.patients[0].smsConsent, null);
  assert.ok(r2.anomalies.some((a) => a.code === "no_sms_consent_column"));
});

test("a UTF-8 BOM does not break the first header", () => {
  const file = "﻿First Name,Last Name,Last Visit\nRosalind,Mbeki,11/14/2024";
  const { headers } = readHeaders(file);
  assert.equal(headers[0], "First Name");
  const r = parseRoster(file, suggestMapping(headers, "other"), "other", TODAY);
  assert.equal(r.patients.length, 1);
});

test("csv output quotes properly and defuses formula injection", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('say "hi", now'), '"say ""hi"", now"');
  assert.equal(csvCell("=SUM(A1:A9)"), "'=SUM(A1:A9)");
  assert.equal(csvCell(null), "");
  assert.equal(
    toCsv(["a", "b"], [[1, "x,y"]]),
    'a,b\r\n1,"x,y"\r\n',
  );
});
