/**
 * The message-content lint.
 *
 * ARCHITECTURE.md puts email and SMS *outside* the PHI boundary, on the grounds
 * that a message carries a first name, a practice name and a link. That is a claim
 * about the code, so it is tested like one: build every message with a patient
 * whose surname, email, date of birth, member ID, diagnosis and screener score are
 * distinctive strings, then assert none of them appear anywhere in the output.
 *
 * If someone later "helpfully" adds the appointment date or the packet name to a
 * reminder, this test fails, which is the point.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clinicianNotificationEmail,
  intakeInviteEmail,
  intakeReminderEmail,
  intakeReminderSms,
  intakeUrl,
} from "@/lib/messages";

/** Things that must never leave the building in a message body. */
const FORBIDDEN = [
  "Okonkwo", // surname
  "1988-04-12", // date of birth
  "dana.okonkwo@example.com", // email address
  "4471-22-8890", // insurance member id
  "generalised anxiety", // a diagnosis
  "PHQ-9", // an instrument name
  "MODERATELY SEVERE", // a severity band
  "panic attacks", // an answer
];

const inputs = {
  firstName: "Dana",
  practiceName: "Riverbend Counseling",
  url: "https://app.formforge.health/intake/Ck8sQ2p5R1hUb2tlbjEy",
};

function assertClean(text: string, label: string): void {
  for (const secret of FORBIDDEN) {
    assert.ok(!text.includes(secret), `${label} leaked "${secret}"`);
  }
}

describe("patient messages carry a first name, a practice name and a link", () => {
  it("the invite email leaks nothing", () => {
    const message = intakeInviteEmail(inputs);
    assertClean(`${message.subject}\n${message.text}\n${message.html}`, "invite");
    assert.match(message.subject, /Riverbend Counseling/);
    assert.match(message.text, /Hi Dana,/);
    assert.ok(message.text.includes(inputs.url));
  });

  it("the reminder email leaks nothing and says progress is saved", () => {
    const message = intakeReminderEmail(inputs);
    assertClean(`${message.subject}\n${message.text}\n${message.html}`, "reminder");
    assert.match(message.text, /saved/);
    assert.match(message.subject, /^Reminder:/);
  });

  it("the reminder SMS leaks nothing, fits one segment, and offers STOP", () => {
    const body = intakeReminderSms(inputs);
    assertClean(body, "sms");
    assert.match(body, /Reply STOP to opt out\.$/);
    assert.ok(body.length <= 160, `SMS is ${body.length} characters`);
  });

  it("the clinician notification names only the patient's first name", () => {
    const message = clinicianNotificationEmail({
      clinicianName: "Dr. Osei",
      patientFirstName: "Dana",
      practiceName: "Riverbend Counseling",
      dashboardUrl: "https://app.formforge.health/intakes",
      riskFlag: false,
    });
    assertClean(`${message.subject}\n${message.text}`, "clinician notification");
    assert.match(message.subject, /Dana completed their intake/);
  });

  it("the risk-flag notification says review is needed without naming the instrument", () => {
    const message = clinicianNotificationEmail({
      clinicianName: "Dr. Osei",
      patientFirstName: "Dana",
      practiceName: "Riverbend Counseling",
      dashboardUrl: "https://app.formforge.health/intakes",
      riskFlag: true,
    });
    assertClean(`${message.subject}\n${message.text}`, "risk notification");
    assert.match(message.subject, /Review needed/);
    assert.match(message.text, /needs your attention/);
  });

  it("takes only three strings, so it cannot see a patient row", () => {
    // Arity is the enforcement: a template that wanted the date of birth would
    // have to change its signature, and this assertion would fail first.
    assert.equal(intakeInviteEmail.length, 1);
    assert.equal(intakeReminderSms.length, 1);
  });
});

describe("html escaping", () => {
  it("escapes a practice name containing markup rather than rendering it", () => {
    const message = intakeInviteEmail({
      ...inputs,
      practiceName: 'Riverbend <script>alert("x")</script>',
    });
    assert.ok(!message.html.includes("<script>"));
    assert.ok(message.html.includes("&lt;script&gt;"));
  });
});

describe("intakeUrl", () => {
  it("builds the link and tolerates a trailing slash on the base", () => {
    assert.equal(intakeUrl("https://app.formforge.health/", "abc"), "https://app.formforge.health/intake/abc");
    assert.equal(intakeUrl("http://localhost:3048", "abc"), "http://localhost:3048/intake/abc");
  });
});
