# NetNest

**Your whole net worth on one line, finally — every account, the house, the cars, and what it all adds up to, without selling your data to anyone.**

## The enemy

The Sunday-night spreadsheet with seven tabs and last quarter's
numbers. Since Mint died, tracking net worth means either a budgeting
app that buries the number under transaction categorization, a
brokerage's partial view that ignores the mortgage and the truck, or
the DIY spreadsheet that's stale the day after you update it. And the
free tools were never free — the data was the product. NetNest kills
the spreadsheet: link the accounts, add the stuff, and watch one line
— total assets minus total debts — move through time. That line is the
entire product.

## Who pays

- Households tracking toward FI/retirement who want the number, not a
  budget lecture.
- Ex-Mint/Personal Capital users burned by shutdowns and upsells.
- Privacy-conscious savers who will pay $9.99/mo specifically so they
  are not the product.

## MVP feature list (mobile app + small server)

1. **Linked accounts (Plaid)** — checking, savings, brokerage,
   retirement, credit cards, mortgages, loans; balances only — NetNest
   never pulls transaction history it doesn't need.
2. **Manual assets** — home (user-entered estimate with an update
   nudge), vehicles, valuables, private holdings; manual debts too.
3. **The Line** — net worth over time as the hero visual: one line,
   monthly points, pinch to zoom range; asset/debt breakdown one tap
   below.
4. **Monthly close** — a once-a-month ritual: confirm balances, update
   manual estimates, add a one-line note ("bonus landed"); the close
   stamps the month's point on the Line. Closes make the history
   trustworthy — no phantom intraday noise.
5. **Household sharing** — two partners, one nest; both see the same
   Line; each links their own institutions.
6. **Allocation view** — assets by class (cash / invested / property /
   other) as plain stacked bars, not donut theater.
7. **Privacy architecture** — balances-only scopes, encryption at
   rest, delete-my-data button that actually cascades, no ads, no
   data resale, ever; the privacy page is marketing.
8. **Free tier** — 3 linked accounts + unlimited manual entries;
   **NetNest Plus** ($9.99/mo or $69/yr via RevenueCat) unlocks
   unlimited links, household sharing, and CSV export.

## Pricing

Freemium via RevenueCat:
- **Free** — 3 linked accounts, manual assets, the Line.
- **NetNest Plus** — $9.99/mo or **$69/yr**: unlimited accounts,
  household sharing, allocation view, CSV export.

Plaid costs make free links a real cost — the 3-link cap is honest
economics, stated plainly on the paywall.

## Competitive landscape

Post-Mint, the field is Monarch and Copilot (budget-first, ~$8–15/mo),
Empower/Personal Capital (free dashboard as an advisory-services
funnel), and Kubera (excellent all-asset tracking, priced ~$150/yr for
power users). NetNest's wedge is radical narrowness: the net-worth
line and the monthly close, at an impulse price, with privacy as the
headline — no budget features to maintain, no advisory upsell to
apologize for.

## Landing page (web + App Store copy share the device)

- **Hero device:** "Your whole net worth on one line, finally." — the
  phone frame draws the Line left to right through 18 monthly closes,
  the number in the header counts up to $487,230, a monthly-close
  stamp lands ("Feb closed — bonus landed"), and the allocation bars
  settle beneath. Four beats, hold on the Line.
- **The enemy, named:** the seven-tab spreadsheet with last quarter's
  numbers.
- **Receipts:** the privacy page linked from the hero; demo data
  labeled as demo.
- **One CTA phrase, verbatim everywhere:** **"Get NetNest free"**.
