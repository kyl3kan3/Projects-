/**
 * The self-storage rental agreement, as text.
 *
 * Kept separate from the PDF renderer so it can be read on screen (the tenant
 * reads it on a phone before signing) and hashed byte-for-byte. The version
 * string is part of the hashed document: if the template changes, an old lease's
 * hash still verifies against the text that was actually signed.
 *
 * The state-specific paragraph is the lien disclosure, which cites the statute the
 * facility's state actually runs under, from the reviewed rule pack. A state
 * without a pack gets a paragraph that says so rather than a citation UnitKeeper
 * cannot stand behind.
 */

import { packFor } from "@/lib/lien-rules";
import { formatDateLong, formatMoney, type IsoDate } from "@/lib/money";

export const LEASE_TEMPLATE_VERSION = "uk-lease-1.0";

export interface LeaseFacts {
  facilityName: string;
  facilityAddress: string;
  facilityState: string;
  ownerLegalName: string;
  tenantName: string;
  tenantAddress: string;
  tenantEmail: string;
  tenantPhone: string;
  alternateContact: string;
  unitLabel: string;
  unitSize: string;
  rateCents: number;
  startedOn: IsoDate;
  rentDueDay: number;
  prorateRule: "daily" | "full_month";
  firstPaymentCents: number;
  ladderSummary: string;
  ownerTerms: string;
}

function ordinal(day: number): string {
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  return `${day}${suffix}`;
}

export interface LeaseSection {
  heading: string;
  body: string;
}

export function leaseSections(facts: LeaseFacts): LeaseSection[] {
  const pack = packFor(facts.facilityState);
  const lienParagraph = pack
    ? `The facility has a lien on all property stored in the unit for unpaid rent and other charges. ` +
      `If rent goes unpaid, ${facts.facilityName} may enforce that lien under ${pack.steps[0].citation} and the ` +
      `following sections of ${facts.facilityState} law, which require written notice to the address below, a ` +
      `waiting period, and published notice before any sale. Tenant will be sent each notice the statute requires ` +
      `and the dates will be stated in it.`
    : `The facility has a lien on all property stored in the unit for unpaid rent and other charges. ` +
      `${facts.facilityState} lien-enforcement procedure is not modelled in UnitKeeper's reviewed rule set, so the ` +
      `facility will follow the procedure in ${facts.facilityState} law and give Tenant every notice it requires. ` +
      `Nothing in this agreement shortens a notice period the statute grants Tenant.`;

  return [
    {
      heading: "1. Parties and unit",
      body:
        `This rental agreement is between ${facts.ownerLegalName} ("Facility"), operating ${facts.facilityName} at ` +
        `${facts.facilityAddress || "the address on file"}, and ${facts.tenantName} ("Tenant"). ` +
        `Facility rents to Tenant unit ${facts.unitLabel}, approximately ${facts.unitSize}, beginning ` +
        `${formatDateLong(facts.startedOn)}. The unit is rented for storage only. It is not a residence and no ` +
        `person or animal may occupy it.`,
    },
    {
      heading: "2. Rent",
      body:
        `Rent is ${formatMoney(facts.rateCents)} per month, due on the ${ordinal(facts.rentDueDay)} of each month ` +
        `without invoice or demand. The first payment is ${formatMoney(facts.firstPaymentCents)}, ` +
        `${facts.prorateRule === "daily" ? "prorated for the days remaining in the first month" : "the full first month, which is not prorated"}. ` +
        `Rent is month-to-month and continues until either party ends this agreement.`,
    },
    {
      heading: "3. Late charges and access",
      body:
        `If rent is not paid when due, the following steps apply: ${facts.ladderSummary} ` +
        `Overlock means Facility places its own lock on the unit and Tenant's gate code stops working until the ` +
        `balance is paid. Late charges are added to Tenant's ledger and are payable as rent.`,
    },
    {
      heading: "4. Facility lien",
      body: lienParagraph,
    },
    {
      heading: "5. Notice address",
      body:
        `Every notice under this agreement — including any lien notice — is sent to Tenant at ` +
        `${facts.tenantAddress || "the address Tenant provides below"}` +
        `${facts.tenantEmail ? `, with a courtesy copy to ${facts.tenantEmail}` : ""}. ` +
        `${facts.alternateContact ? `Alternate contact: ${facts.alternateContact}. ` : ""}` +
        `Tenant must tell Facility in writing when this address changes. A notice sent to the last address Tenant ` +
        `gave is effective even if Tenant no longer receives mail there.`,
    },
    {
      heading: "6. Insurance and risk of loss",
      body:
        `Property is stored at Tenant's sole risk. Facility is not an insurer and does not provide insurance on ` +
        `Tenant's property. Tenant is responsible for insuring the contents of the unit and represents that the ` +
        `total value of property stored is within any limit stated in Facility's rules.`,
    },
    {
      heading: "7. Prohibited property",
      body:
        `Tenant may not store food, living things, stolen property, explosives, fuel, or anything flammable, toxic ` +
        `or illegal. Tenant may not store anything whose value exceeds a limit Facility has stated in writing.`,
    },
    {
      heading: "8. Ending the tenancy",
      body:
        `Either party may end this agreement with written notice. On move-out Tenant must empty and sweep the unit ` +
        `and remove Tenant's lock. Tenant's gate code is revoked when the tenancy ends. Any balance remaining is ` +
        `due immediately; any credit is refunded to Tenant.`,
    },
    ...(facts.ownerTerms.trim()
      ? [{ heading: "9. Facility rules", body: facts.ownerTerms.trim() }]
      : []),
  ];
}

/**
 * The full text of the lease, exactly as it is hashed. The signature block is
 * appended by the renderer *after* the hash is taken over this text plus the
 * signature line, so the hash covers what the tenant actually agreed to.
 */
export function leasePlainText(facts: LeaseFacts): string {
  const head = [
    `SELF-STORAGE RENTAL AGREEMENT`,
    `${facts.facilityName} — unit ${facts.unitLabel} (${facts.unitSize})`,
    `Template ${LEASE_TEMPLATE_VERSION}`,
    "",
  ].join("\n");
  return (
    head +
    leaseSections(facts)
      .map((s) => `${s.heading}\n${s.body}`)
      .join("\n\n")
  );
}
