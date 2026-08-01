#!/usr/bin/env bash
# Throwaway HTTP walk-through against the running production server.
# Exercises the routes a real landlord, applicant and tenant hit, through Next's
# rendering and server actions rather than through the domain layer directly.
set -uo pipefail

BASE=http://localhost:3044
JAR=/tmp/tf-cookies.txt
rm -f "$JAR"
PASS=0
FAIL=0

check() { # label expected actual
  if [ "$2" = "$3" ]; then echo "  PASS  $1"; PASS=$((PASS+1));
  else echo "  FAIL  $1 (expected $2, got $3)"; FAIL=$((FAIL+1)); fi
}
contains() { # label needle file
  if grep -qF -- "$2" "$3"; then echo "  PASS  $1"; PASS=$((PASS+1));
  else echo "  FAIL  $1 (missing: $2)"; FAIL=$((FAIL+1)); fi
}
absent() {
  if grep -qF -- "$2" "$3"; then echo "  FAIL  $1 (found: $2)"; FAIL=$((FAIL+1));
  else echo "  PASS  $1"; PASS=$((PASS+1)); fi
}
status() { curl -s -o "$2" -w "%{http_code}" -b "$JAR" -c "$JAR" "$1"; }

echo "=== Public pages"
check "landing page renders" 200 "$(status "$BASE/" /tmp/tf-landing.html)"
check "signup renders" 200 "$(status "$BASE/signup" /tmp/tf-signup.html)"
check "robots.txt" 200 "$(status "$BASE/robots.txt" /tmp/tf-robots.txt)"
check "sitemap.xml" 200 "$(status "$BASE/sitemap.xml" /tmp/tf-sitemap.xml)"
check "manifest" 200 "$(status "$BASE/manifest.webmanifest" /tmp/tf-manifest.json)"
contains "robots blocks the tenant portal" "/t/" /tmp/tf-robots.txt
contains "fonts are self-hosted (no Google Fonts request)" "/_next/static/media/" /tmp/tf-landing.html
absent "no gstatic font request on the landing page" "fonts.gstatic.com" /tmp/tf-landing.html

echo
echo "=== Auth gate"
check "an unauthenticated /units redirects" 307 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/units")"
check "an unauthenticated /rent redirects" 307 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/rent")"
check "an unauthenticated export is refused" 307 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tenancies/00000000-0000-0000-0000-000000000000/export")"

echo
echo "=== Cron endpoint"
check "cron without the secret is refused" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/cron/tick")"
check "cron with a wrong secret is refused" 401 "$(curl -s -o /dev/null -w '%{http_code}' -H 'authorization: Bearer nope' "$BASE/api/cron/tick")"
CRON=$(curl -s -H "authorization: Bearer local-dev-cron-secret" "$BASE/api/cron/tick")
echo "$CRON" > /tmp/tf-cron.json
contains "cron with the right secret runs" '"ok":true' /tmp/tf-cron.json

echo
echo "=== Stripe webhook"
check "webhook without a signature is rejected" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -d '{}' "$BASE/api/webhooks/stripe")"

echo
echo "=== Not-found handling"
check "an unknown listing slug 404s" 404 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/apply/no-such-listing")"
check "a bogus tenant token 404s" 404 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/t/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")"
check "a bogus signing token 404s" 404 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/sign/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")"
check "a bogus screening token 404s" 404 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/screen/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")"

echo
echo "=== Seeded walk-through (rows created by scripts/seed-http.ts)"
if [ -f /tmp/tf-seed.env ]; then
  # shellcheck disable=SC1091
  . /tmp/tf-seed.env
  check "public listing page renders" 200 "$(status "$BASE/apply/$SLUG" /tmp/tf-apply.html)"
  contains "listing shows the headline" "Bright 2-bed upstairs unit" /tmp/tf-apply.html
  contains "listing shows the rent in mono" "\$1,850.00" /tmp/tf-apply.html
  contains "listing has the application form" 'name="applicantName"' /tmp/tf-apply.html
  absent "listing asks nothing about protected classes" "marital status?" /tmp/tf-apply.html

  check "tenant portal renders from its token" 200 "$(status "$BASE/t/$PORTAL" /tmp/tf-portal.html)"
  contains "portal header is the landlord's name" "Alvarez Rentals" /tmp/tf-portal.html
  contains "portal shows the balance" "Balance" /tmp/tf-portal.html
  contains "portal shows the ledger strip" "strip-cell" /tmp/tf-portal.html
  contains "portal offers the repair form" "Something needs fixing" /tmp/tf-portal.html
  absent "portal is not indexed" '<meta name="robots" content="index' /tmp/tf-portal.html

  check "screening consent page renders" 200 "$(status "$BASE/screen/$SCREEN" /tmp/tf-screen.html)"
  contains "consent page states the disclosure" "consumer reporting agency" /tmp/tf-screen.html
  contains "consent page states the free-copy right" "free copy" /tmp/tf-screen.html

  check "lease signing page renders" 200 "$(status "$BASE/sign/$SIGN" /tmp/tf-sign.html)"
  contains "signing page shows the whole lease" "10. State-specific terms" /tmp/tf-sign.html
  contains "signing page has the consent sentence" "typing my name here is my signature" /tmp/tf-sign.html

  check "a listing photo is publicly readable" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/files/$PHOTO_KEY")"
  check "an applicant document is NOT publicly readable" 404 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/files/$DOC_KEY")"
  check "a traversal key is refused" 404 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/files/..%2f..%2fpackage.json")"
else
  echo "  SKIP  no /tmp/tf-seed.env — run scripts/seed-http.ts first"
fi

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
