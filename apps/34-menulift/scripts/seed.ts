/**
 * Development seed: one restaurant, a real menu, plate costs, and a sample POS
 * export you can feed straight into the importer.
 *
 * Run with `npm run seed`. Idempotent by email — a second run reuses the account.
 *
 * Deliberately talks to the database directly rather than going through
 * `src/lib/menus.ts`: those functions call `revalidatePath`, which only exists
 * inside a Next request. A seed is not a request.
 *
 * The content is a plausible Philadelphia neighbourhood restaurant, not lorem.
 * The prices, plate costs, and sales mix are chosen so the matrix produces a
 * defensible answer — stars, plowhorses, puzzles, dogs, and a couple of dishes
 * the analysis correctly refuses to call.
 */

import "@/lib/load-env";
import { randomBytes, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { locations, menuItems, menuSections, menus, organizations, users } from "@/db/schema";

const scrypt = promisify(_scrypt);

const EMAIL = "dana@rossiandco.test";
const PASSWORD = "table-for-two";
const STAFF_PIN = "4826";
const TRIAL_DAYS = 14;

async function hash(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(secret, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

interface SeedItem {
  name: string;
  description: string;
  price: number;
  cost: number | null;
  tags?: string[];
}

const MENU: { section: string; note?: string; items: SeedItem[] }[] = [
  {
    section: "Starters",
    note: "Add a side of focaccia for $5",
    items: [
      { name: "Burrata", description: "grilled peach, basil, sourdough", price: 1600, cost: 700, tags: ["V"] },
      { name: "Shrimp Toast", description: "chili crisp, scallion, lime", price: 1400, cost: 800 },
      { name: "Little Gem Salad", description: "buttermilk, dill, cucumber, pistachio", price: 1300, cost: 420, tags: ["V", "GF"] },
      { name: "Charred Broccolini", description: "anchovy butter, lemon, breadcrumb", price: 1200, cost: 380, tags: ["DF"] },
      { name: "Marinated Olives", description: "orange peel, fennel seed, chili", price: 700, cost: 180, tags: ["VG", "GF", "DF"] },
    ],
  },
  {
    section: "Mains",
    items: [
      { name: "Crispy Half Chicken", description: "chili honey, pickled fennel", price: 2400, cost: 800, tags: ["GF"] },
      { name: "Grilled Swordfish", description: "salsa verde, charred lemon, white beans", price: 3200, cost: 1400, tags: ["GF", "DF"] },
      { name: "Cacio e Pepe", description: "hand-cut tonnarelli, pecorino, black pepper", price: 2100, cost: 520, tags: ["V"] },
      { name: "Dry-Aged Burger", description: "aged cheddar, house pickles, sesame bun", price: 1900, cost: 760 },
      { name: "Mushroom Risotto", description: "maitake, thyme, parmesan", price: 2200, cost: 640, tags: ["V", "GF"] },
      // Left without a plate cost on purpose: the matrix must say so rather than guess.
      { name: "Pork Chop Milanese", description: "arugula, caper vinaigrette", price: 3400, cost: null },
    ],
  },
  {
    section: "Desserts",
    items: [
      { name: "Olive Oil Cake", description: "rosemary, whipped ricotta", price: 1100, cost: 260, tags: ["V"] },
      { name: "Affogato", description: "espresso, vanilla gelato", price: 800, cost: 150, tags: ["V", "GF"] },
      { name: "Budino", description: "salted caramel, cocoa nib", price: 1000, cost: 240, tags: ["V"] },
      { name: "Cheese Plate", description: "three cheeses, honeycomb, seeded crackers", price: 1600, cost: 900, tags: ["V"] },
    ],
  },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28);
}

async function main() {
  const db = getDb();

  const [existingUser] = await db.select().from(users).where(eq(users.email, EMAIL));
  let organizationId: string;

  if (existingUser) {
    organizationId = existingUser.organizationId;
    console.log(`Reusing ${EMAIL}`);
  } else {
    const [org] = await db
      .insert(organizations)
      .values({
        name: "Rossi & Co",
        // Seeded on the Margin tier so every screen is reachable in development.
        plan: "margin",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
        locationQuantity: 1,
      })
      .returning();
    organizationId = org.id;

    await db.insert(users).values({
      organizationId: org.id,
      email: EMAIL,
      name: "Dana",
      passwordHash: await hash(PASSWORD),
      role: "owner",
    });
    console.log(`Created ${EMAIL} / ${PASSWORD}`);
  }

  let [location] = await db
    .select()
    .from(locations)
    .where(eq(locations.organizationId, organizationId));
  if (!location) {
    [location] = await db
      .insert(locations)
      .values({
        organizationId,
        name: "Rossi & Co",
        slug: slugify("Rossi & Co Fishtown"),
        timezone: "America/New_York",
        address: "1420 Frankford Ave, Philadelphia",
        staffPin: await hash(STAFF_PIN),
      })
      .returning();
  } else if (!location.staffPin) {
    await db.update(locations).set({ staffPin: await hash(STAFF_PIN) }).where(eq(locations.id, location.id));
  }

  const [existingMenu] = await db
    .select()
    .from(menus)
    .where(and(eq(menus.locationId, location.id), eq(menus.name, "Dinner")));

  if (existingMenu) {
    console.log("Dinner menu already exists — leaving it alone");
  } else {
    const [menu] = await db
      .insert(menus)
      .values({
        locationId: location.id,
        name: "Dinner",
        daypart: { start: "17:00", end: "22:00" },
        status: "live",
        publishedAt: new Date(),
        position: 0,
      })
      .returning();

    for (const [sectionIndex, block] of MENU.entries()) {
      const [section] = await db
        .insert(menuSections)
        .values({
          menuId: menu.id,
          name: block.section,
          note: block.note ?? null,
          position: sectionIndex * 100,
        })
        .returning();

      await db.insert(menuItems).values(
        block.items.map((item, itemIndex) => ({
          sectionId: section.id,
          locationId: location.id,
          name: item.name,
          description: item.description,
          priceCents: item.price,
          costCents: item.cost,
          dietaryTags: item.tags ?? [],
          position: itemIndex * 100,
        })),
      );
    }
    console.log("Dinner menu created and published");
  }

  const sections = await db
    .select()
    .from(menuSections)
    .innerJoin(menus, eq(menus.id, menuSections.menuId))
    .where(eq(menus.locationId, location.id));
  const items = await db.select().from(menuItems).where(eq(menuItems.locationId, location.id));

  console.log(`\nSeeded ${sections.length} sections and ${items.length} dishes.`);
  console.log(`Sign in:     ${EMAIL} / ${PASSWORD}`);
  console.log(`Guest menu:  /m/${location.slug}`);
  console.log(`Expo board:  /board/${location.slug}   (PIN ${STAFF_PIN})`);
  console.log(`Sample POS export: scripts/sample-toast-export.csv`);
}

main()
  .then(() => closeDb())
  .catch(async (error) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });
