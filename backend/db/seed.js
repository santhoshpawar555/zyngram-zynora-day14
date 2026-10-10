
const { db } = require("./store");
const { hashPassword } = require("../lib/auth");
const { generateId } = require("../lib/id");
const knowledgeService = require("../services/knowledgeService");

async function seedUsers() {
  const existing = await db.users.findAll();
  if (existing.length > 0) return;
  await db.users.insert({
    id: generateId("USR"),
    email: "admin@zyngram.test",
    passwordHash: hashPassword("Admin@12345"),
    role: "admin",
    name: "Zynora Admin",
    createdAt: new Date().toISOString(),
  });
  await db.users.insert({
    id: generateId("USR"),
    email: "staff@zyngram.test",
    passwordHash: hashPassword("Staff@12345"),
    role: "staff",
    name: "Zyngram Staff Member",
    createdAt: new Date().toISOString(),
  });
  await db.users.insert({
    id: generateId("USR"),
    email: "staff2@zyngram.test",
    passwordHash: hashPassword("Staff@12345"),
    role: "staff",
    name: "Zyngram Staff Member",
    createdAt: new Date().toISOString(),
  });
}

const DOCS = [
  {
    title: "What is Zyngram",
    category: "Company",
    version: "v1",
    source: "Zyngram Internal Handbook",
    format: "txt",
    rawContent:
      "Zyngram is a hyperlocal franchise-based service platform. It connects customers to everyday services such as mobile recharge, utility bill payments, and local deliveries through a franchise network spread across India.\n\n" +
      "Zyngram's mission is to create local business ownership opportunities while giving customers a single, reliable app for everyday services. Every service on the platform is delivered through a human-owned franchise, not a faceless call center.",
  },
  {
    title: "Zyngram Physical Franchise Hierarchy",
    category: "Company",
    version: "v1",
    source: "Zyngram Internal Handbook",
    format: "txt",
    rawContent:
      "Zyngram's physical, real-world franchise structure has five levels, from smallest to largest: Point, Center, Hub, Command, and Headquarters (HQ).\n\n" +
      "A Point is the smallest unit, typically covering a single neighborhood. Several Points report to one Center, which usually covers a town or a city area. Several Centers report to one Hub, which covers a district-level area. Several Hubs report to one Command, which covers a state-level area. All Commands report to Zyngram HQ, which sets policy for the entire network.",
  },
  {
    title: "Zyngram Digital Mapping Hierarchy",
    category: "Company",
    version: "v1",
    source: "Zyngram Internal Handbook",
    format: "txt",
    rawContent:
      "Separate from the physical franchise hierarchy, Zyngram also tracks a digital hierarchy for mapping and analytics purposes: Node, Zone, Territory, Region, and Nation, from smallest to largest.\n\n" +
      "A customer's GPS location is mapped internally to a Node, which rolls up into a Zone, then a Territory, then a Region, and finally the Nation level. This digital hierarchy is used for geo-mapping and reporting, and is kept separate from the Point/Center/Hub/Command ownership hierarchy so that analytics changes never affect who owns a franchise.",
  },
  {
    title: "Mobile Recharge Service",
    category: "Services",
    version: "v1",
    source: "Zyngram Service Catalogue",
    format: "txt",
    rawContent:
      "Mobile Recharge was Zyngram's first live service. A customer enters their mobile number and recharge amount, the order is validated, and once confirmed, the recharge is processed and the order status moves to SUCCESS.\n\n" +
      "Mobile Recharge orders are protected against duplicate confirmation: if a customer tries to confirm the same order twice, the second attempt is rejected and logged, so the customer cannot be charged twice for one recharge.",
  },
  {
    title: "Utility Bill Payment Service",
    category: "Services",
    version: "v1",
    source: "Zyngram Service Catalogue",
    format: "txt",
    rawContent:
      "Utility Bill Payment lets customers pay electricity, water, and gas bills through the Zyngram app. The customer enters their consumer number, the current bill amount is fetched, and payment is confirmed the same way as a recharge order, through a validate-then-confirm flow.",
  },
  {
    title: "Local Delivery Service",
    category: "Services",
    version: "v1",
    source: "Zyngram Service Catalogue",
    format: "txt",
    rawContent:
      "Local Delivery is a hyperlocal delivery service where a nearby franchise Point fulfills small delivery requests - groceries, documents, or small parcels - within its own neighborhood coverage area, usually within a few kilometers.",
  },
  {
    title: "How Franchise Ownership Works",
    category: "Franchise",
    version: "v1",
    source: "Zyngram Franchise Policy",
    format: "txt",
    rawContent:
      "Anyone can apply to own a Point, Center, Hub, or Command franchise. An application is reviewed by Zyngram admin staff before being approved - not every Point/Center/Hub/Command has an owner at all times; some remain intentionally unassigned until a suitable applicant is approved.\n\n" +
      "Once approved, a franchise owner earns commission on orders placed by customers whose GPS location maps to their franchise's coverage area, at every level the order's attribution chain passes through.",
  },
  {
    title: "Multi-Level Commission Structure",
    category: "Franchise",
    version: "v1",
    source: "Zyngram Franchise Policy",
    format: "txt",
    rawContent:
      "When a customer completes an order, Zyngram calculates commission for every level of the franchise hierarchy the order is attributed to: Point, Center, Hub, and Command can each earn a percentage of the order amount, based on the commission rule active for that service at the time of the order.\n\n" +
      "If a level in the hierarchy currently has no owner assigned, that level's commission is simply skipped - it is never paid to a different franchise or held pending, and this is logged for transparency.",
  },
  {
    title: "Commission Settlement and Wallet",
    category: "Franchise",
    version: "v1",
    source: "Zyngram Franchise Policy",
    format: "txt",
    rawContent:
      "A calculated commission moves through a lifecycle: CALCULATED, then PENDING, then ELIGIBLE, and finally SETTLED. Only an admin can settle a commission, moving its value into the franchise owner's wallet.\n\n" +
      "A franchise owner's wallet balance is never stored as a single stale number - it is always derived fresh from the ledger of settled commission entries, so the balance can never silently drift out of sync with the actual payment history.",
  },
  {
    title: "Data Privacy Policy",
    category: "Policies",
    version: "v1",
    source: "Zyngram Data Policy",
    format: "txt",
    rawContent:
      "Zyngram does not share a customer's exact GPS coordinates or personal contact details with franchise owners. Franchise owners only see aggregated order and commission information for their own coverage area - never a customer's raw location data or another franchise owner's earnings.",
  },
  {
    title: "Refund Policy",
    category: "Policies",
    version: "v1",
    source: "Zyngram Customer Policy",
    format: "txt",
    rawContent:
      "If a Mobile Recharge or Bill Payment order fails after payment has been deducted, the amount is automatically reversed to the customer's original payment method within 2 to 5 business days. Customers can track a refund's status from the Order Status screen in the app.",
  },
  {
    title: "Working Hours and Support Policy",
    category: "Policies",
    version: "v1",
    source: "Zyngram Internal Handbook",
    format: "txt",
    rawContent:
      "Zyngram's internal support desk for franchise owners is available from 9 AM to 7 PM, Monday through Saturday. Customer-facing automated services such as Mobile Recharge remain available 24 hours a day, since they do not require a human operator.",
  },
  {
    title: "Frequently Asked Questions - General",
    category: "FAQ",
    version: "v1",
    source: "Zyngram FAQ",
    format: "json",
    rawContent: JSON.stringify([
      { heading: "How do I apply for a franchise?", text: "Submit a franchise application through the Zyngram app or website, specifying the level (Point, Center, Hub, or Command) and area you want. An admin reviews and approves or rejects the application." },
      { heading: "What happens if my recharge fails?", text: "If a recharge order fails after the amount is deducted, Zyngram automatically reverses the payment to your original payment method within 2 to 5 business days." },
      { heading: "Can two franchise owners cover the same area?", text: "No. Each Point, Center, Hub, and Command covers a distinct, non-overlapping geographic area, and each area has at most one owner at a time." },
    ]),
  },
  {
    title: "Frequently Asked Questions - Zynora Chatbot",
    category: "FAQ",
    version: "v1",
    source: "Zyngram FAQ",
    format: "json",
    rawContent: JSON.stringify([
      { heading: "What is Zynora?", text: "Zynora is Zyngram's internal assistant chatbot. It only answers using Zyngram's own approved knowledge base - it never uses an external AI service, and it never searches the internet." },
      { heading: "Why did Zynora say it couldn't find an answer?", text: "Zynora only answers from knowledge an admin has reviewed, approved, and activated. If a topic hasn't been added to the knowledge base yet, Zynora will say so honestly instead of guessing." },
    ]),
  },
];

async function seedKnowledgeBase() {
  const existing = await db.knowledgeDocuments.findAll();
  if (existing.length > 0) return;
  for (const docInput of DOCS) {
    const doc = await knowledgeService.ingestDocument({ ...docInput, createdBy: "seed-script" });
    await knowledgeService.approveDocument(doc.id);
    await knowledgeService.activateDocument(doc.id);
  }
}

async function seedAll() {
  await seedUsers();
  await seedKnowledgeBase();
}

module.exports = { seedAll };
