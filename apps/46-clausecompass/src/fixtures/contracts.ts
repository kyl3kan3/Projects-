/**
 * src/fixtures/contracts.ts
 *
 * Contract fixtures. Three documents, written to look like the paper a freelancer
 * actually receives, with hand-labelled expected flags.
 *
 * They serve three purposes and must stay honest for all of them:
 *  - the unit tests assert the analyser's output against `expectedFlags`;
 *  - `npm run eval` scores flag recall and fabricated-quote count over them;
 *  - the upload screen offers the first one as a labelled sample so a new account
 *    can see a real report before handing over a real contract.
 *
 * They are invented documents, not anonymised customer paper — the sample is
 * labelled as a demo everywhere it appears.
 */

import type { ContractType } from "@/db/schema";

export interface ContractFixture {
  key: string;
  name: string;
  title: string;
  counterparty: string;
  contractType: ContractType;
  /** Rule keys a correct review must fire. The eval suite measures recall on this. */
  expectedFlags: string[];
  text: string;
}

const HOSTILE_MSA = `MASTER SERVICES AGREEMENT

This Master Services Agreement (the "Agreement") is entered into as of March 4, 2026 (the "Effective Date") by and between Northgate Retail Group, Inc., a Delaware corporation with offices at 1100 Marquette Avenue, Minneapolis, MN ("Client"), and the undersigned service provider ("Contractor"). Client and Contractor are each a "Party" and together the "Parties."

1. SERVICES

1.1 Scope. Contractor shall provide the design, development and related professional services described in each statement of work executed by the Parties (each, a "SOW"). Each SOW is incorporated into this Agreement by reference. In the event of a conflict between a SOW and this Agreement, this Agreement controls.

1.2 Standard of Performance. Contractor shall perform the Services in a professional and workmanlike manner consistent with industry standards and shall devote such time and resources as are reasonably necessary to complete the Services on the schedule set out in the applicable SOW.

2. REVISIONS AND SCOPE

2.1 Revisions. Contractor shall provide revisions to any deliverable as necessary to satisfy Client, without additional charge, until Client provides written acceptance of that deliverable. Client may request revisions at any time prior to acceptance.

2.2 Additional Services. Services not described in a SOW may be requested by Client in writing and shall be performed by Contractor at the rates set out in the applicable SOW.

3. FEES AND PAYMENT

3.1 Fees. Client shall pay Contractor the fees set out in the applicable SOW. Contractor shall invoice Client monthly in arrears for Services performed.

3.2 Payment Terms. Client shall pay each undisputed invoice within sixty (60) days of Client's receipt of that invoice. Client may withhold payment of any amount it disputes in good faith pending resolution of the dispute.

3.3 Expenses. Contractor shall bear its own expenses unless a SOW expressly provides otherwise. Pre-approved travel expenses shall be reimbursed at cost without markup.

4. INTELLECTUAL PROPERTY

4.1 Assignment. Contractor hereby irrevocably assigns to Client all right, title and interest in and to all deliverables, work product, materials, designs, source code and documentation created by Contractor in the course of performing the Services (collectively, the "Work Product"), including all copyrights, trademarks, patent rights and trade secrets therein, effective upon creation of each item of Work Product. All Work Product shall be deemed a work made for hire to the maximum extent permitted by applicable law.

4.2 Moral Rights. Contractor waives, and agrees not to assert, any and all moral rights it may have in the Work Product in any jurisdiction.

4.3 Contractor Materials. Contractor retains ownership of tools, libraries and know-how developed by Contractor independently of the Services, and grants Client a perpetual, worldwide, royalty-free license to use such materials as incorporated into the Work Product.

5. CONFIDENTIALITY

5.1 Obligation. Each Party shall hold in confidence all Confidential Information of the other Party and shall not disclose it to any third party except to its employees and contractors who have a need to know and who are bound by written confidentiality obligations no less protective than these.

5.2 Duration. The obligations in this Section 5 survive termination of this Agreement for a period of five (5) years, except with respect to trade secrets, as to which the obligations continue for so long as the information remains a trade secret.

6. INDEMNIFICATION

6.1 By Contractor. Contractor shall defend, indemnify and hold harmless Client, its affiliates, officers, directors, employees and agents from and against any and all claims, damages, losses, liabilities, costs and expenses, including reasonable attorneys' fees, arising out of or relating to the Services, the Work Product, or any act or omission of Contractor.

6.2 Procedure. Client shall have sole control of the defense and settlement of any claim for which it seeks indemnification, and Contractor shall cooperate at Contractor's expense.

7. TERM AND TERMINATION

7.1 Term. This Agreement begins on the Effective Date and continues for an initial term of twelve (12) months.

7.2 Renewal. This Agreement shall automatically renew for successive twelve (12) month renewal terms unless either Party provides written notice of non-renewal at least fifteen (15) days prior to the end of the then-current term.

7.3 Termination by Client. Client may terminate this Agreement or any SOW at any time, for any reason, upon five (5) days' written notice to Contractor.

7.4 Termination for Cause. Either Party may terminate this Agreement upon written notice if the other Party commits a material breach and fails to cure that breach within thirty (30) days of receiving notice of it.

7.5 Effect of Termination. Upon termination, Contractor shall promptly deliver all Work Product in progress. Client shall pay for Services accepted prior to the effective date of termination.

8. NON-COMPETITION

8.1 Restriction. During the term of this Agreement and for twelve (12) months following its termination, Contractor shall not, directly or indirectly, provide services substantially similar to the Services to any competing business operating in the retail grocery sector within the United States.

8.2 Non-Solicitation. During the same period, Contractor shall not solicit for employment any employee of Client with whom Contractor had material contact in connection with the Services.

9. REPRESENTATIONS AND WARRANTIES

9.1 By Contractor. Contractor represents and warrants that the Services will be performed in a professional manner, that the Work Product will be original, and that the Work Product will not infringe the intellectual property rights of any third party.

10. INSURANCE

10.1 Coverage. Contractor shall maintain commercial general liability insurance with limits of not less than $2,000,000 per occurrence and professional liability insurance with limits of not less than $1,000,000 per claim, and shall name Client as an additional insured.

11. INDEPENDENT CONTRACTOR

11.1 Relationship. Contractor is an independent contractor. Nothing in this Agreement creates an employment, partnership or joint venture relationship. Contractor is responsible for all taxes on amounts paid under this Agreement.

12. GOVERNING LAW

12.1 Governing Law. This Agreement is governed by the laws of the State of Delaware, without regard to its conflict of laws principles. The Parties consent to the exclusive jurisdiction of the state and federal courts located in New Castle County, Delaware.

13. GENERAL

13.1 Entire Agreement. This Agreement, together with each SOW, is the entire agreement of the Parties and supersedes all prior discussions.

13.2 Severability. If any provision is held unenforceable, the remaining provisions continue in full force.

13.3 Notices. Notices must be in writing and are effective on receipt when delivered by hand, courier or email to the addresses set out beneath the signature blocks.

13.4 Counterparts. This Agreement may be executed in counterparts, each of which is an original.

14. SERVICE LEVELS

14.1 The service levels, escalation paths and reporting cadence applicable to the Services are set out in Exhibit A, attached and incorporated by reference. Exhibit A may be updated by Client from time to time upon notice.
`;

const FAIR_SOW = `STATEMENT OF WORK — BRAND IDENTITY REFRESH

This Statement of Work ("SOW") is entered into as of April 14, 2026 between Fenwick Coffee Roasters, LLC ("Client") and the undersigned studio ("Studio"), and sets out the services, fees and terms for the engagement described below.

1. SCOPE OF WORK

1.1 Deliverables. Studio shall deliver: (a) one primary logo lockup with two secondary variants; (b) a colour and type system with usage rules; (c) packaging artwork for four SKUs; and (d) a brand guidelines document of no fewer than twelve pages.

1.2 Schedule. Studio shall deliver first concepts within fifteen (15) business days of the kickoff meeting and final files within thirty (30) days of Client's written approval of a concept direction.

2. REVISIONS

2.1 Rounds. The fee includes two (2) rounds of revisions per deliverable. Client shall consolidate feedback into a single written response for each round.

2.2 Additional Rounds. Further revisions are billed at $145 per hour and require a written change order signed by both Parties before work begins.

3. FEES AND PAYMENT

3.1 Fee. The total fee for the Services is $18,500, invoiced as follows: 40% deposit upon execution of this SOW, 30% on delivery of first concepts, and the balance on delivery of final files.

3.2 Payment Terms. Client shall pay each invoice within fifteen (15) days of the invoice date.

3.3 Late Payment. Amounts past due accrue interest at 1.5% per month, and Studio may suspend Services on ten (10) days' written notice while any invoice remains unpaid for more than thirty (30) days.

4. INTELLECTUAL PROPERTY

4.1 Assignment on Payment. Upon Studio's receipt of payment in full of all amounts due under this SOW, Studio assigns to Client all right, title and interest in the final deliverables accepted by Client, including all copyrights therein.

4.2 Studio Materials. Studio retains ownership of preliminary concepts not selected by Client, and of its own templates, processes and tooling.

4.3 Portfolio Rights. Studio may display the delivered work in its portfolio and in self-promotional materials following the public launch of the brand.

5. LIMITATION OF LIABILITY

5.1 Cap. Except for a Party's fraud, willful misconduct or breach of confidentiality obligations, each Party's total aggregate liability arising out of or relating to this SOW shall not exceed the total fees paid or payable under this SOW.

5.2 Exclusion. Neither Party is liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, however caused.

6. INDEMNIFICATION

6.1 Mutual. Each Party shall defend, indemnify and hold harmless the other Party from third-party claims arising from that Party's breach of this SOW, its negligence or its willful misconduct, subject to the limitation of liability in Section 5.

7. CONFIDENTIALITY

7.1 Mutual Obligation. Each Party shall keep the other Party's Confidential Information confidential and use it only to perform this SOW. These obligations continue for three (3) years after completion of the Services.

8. TERM AND TERMINATION

8.1 Termination for Convenience. Either Party may terminate this SOW for any reason upon thirty (30) days' written notice.

8.2 Effect. On termination, Client shall pay for all Services performed and expenses incurred through the effective date of termination, and Studio shall deliver work in progress in its then-current form.

9. GOVERNING LAW

9.1 This SOW is governed by the laws of the State of Oregon. The Parties submit to the exclusive jurisdiction of the state and federal courts located in Multnomah County, Oregon.

10. GENERAL

10.1 Entire Agreement. This SOW and any signed change orders are the entire agreement between the Parties with respect to the Services.

10.2 Counterparts. This SOW may be signed in counterparts and delivered electronically.
`;

const MUTUAL_NDA = `MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement (this "Agreement") is made as of May 2, 2026 between Halden Analytics, Inc. ("Halden") and the undersigned counterparty ("Recipient"). Each Party may disclose Confidential Information to the other in connection with evaluating a potential commercial relationship.

1. CONFIDENTIAL INFORMATION

1.1 Definition. "Confidential Information" means non-public information disclosed by either Party that is marked confidential or that a reasonable person would understand to be confidential, including product plans, pricing, customer lists, source code and financial information.

1.2 Exclusions. Confidential Information does not include information that is or becomes public through no fault of the receiving Party, was known to the receiving Party without obligation of confidence, or is independently developed without use of the disclosing Party's information.

2. OBLIGATIONS

2.1 Use and Disclosure. Each Party shall use the other Party's Confidential Information solely to evaluate the potential relationship, shall protect it with at least reasonable care, and shall not disclose it to any third party other than to its employees and professional advisers who need to know it and who are bound by confidentiality obligations.

2.2 Compelled Disclosure. A Party may disclose Confidential Information to the extent required by law or court order, provided it gives prompt notice where legally permitted.

3. TERM AND TERMINATION

3.1 Term. This Agreement begins on the date first written above and either Party may terminate it upon thirty (30) days' written notice to the other Party.

3.2 Survival. The confidentiality obligations in Section 2 survive for three (3) years following the date of disclosure of the relevant Confidential Information.

4. NO LICENCE OR OBLIGATION

4.1 No Licence. Nothing in this Agreement grants either Party any licence to the other Party's intellectual property.

4.2 No Obligation. Nothing in this Agreement obliges either Party to enter into any further agreement or transaction.

5. RETURN OF MATERIALS

5.1 On written request, each Party shall return or destroy the other Party's Confidential Information, except for copies retained in routine backups or as required by law.

6. GOVERNING LAW

6.1 This Agreement is governed by the laws of the State of Washington, and the Parties consent to the exclusive jurisdiction of the courts located in King County, Washington.

7. GENERAL

7.1 Entire Agreement. This Agreement is the entire agreement of the Parties regarding Confidential Information and supersedes prior understandings on that subject.

7.2 Counterparts. This Agreement may be executed in counterparts.
`;

export const FIXTURES: ContractFixture[] = [
  {
    key: "northgate-msa",
    name: "Hostile client MSA (14 sections)",
    title: "Northgate Retail Group — Master Services Agreement",
    counterparty: "Northgate Retail Group, Inc.",
    contractType: "msa",
    // Hand-labelled from a read of the document. `payment_terms_over_30` rather than
    // `_over_60` is deliberate: the clause says exactly sixty days, and the playbook's
    // HIGH rung is *past* net-60.
    expectedFlags: [
      "payment_terms_over_30",
      "ip_assigns_before_payment",
      "indemnity_not_mutual",
      "indemnity_uncapped",
      "non_compete_present",
      "auto_renewal_short_notice",
      "liability_cap_missing",
      "late_fees_missing",
      "revisions_unlimited",
      "termination_one_sided",
    ],
    text: HOSTILE_MSA,
  },
  {
    key: "fenwick-sow",
    name: "Fair studio SOW",
    title: "Fenwick Coffee Roasters — Brand Identity SOW",
    counterparty: "Fenwick Coffee Roasters, LLC",
    contractType: "sow",
    expectedFlags: [],
    text: FAIR_SOW,
  },
  {
    key: "halden-nda",
    name: "Mutual NDA",
    title: "Halden Analytics — Mutual NDA",
    counterparty: "Halden Analytics, Inc.",
    contractType: "nda",
    expectedFlags: [],
    text: MUTUAL_NDA,
  },
];

export function fixtureByKey(key: string): ContractFixture | undefined {
  return FIXTURES.find((f) => f.key === key);
}

/** The sample offered on the upload screen, labelled as a demo. */
export const SAMPLE_FIXTURE_KEY = "northgate-msa";
