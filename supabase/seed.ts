/**
 * Seed script: Populates Supabase with existing puzzle data and schedule.
 * Run with: npx tsx supabase/seed.ts
 * 
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 * (service role key bypasses RLS for admin operations)
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  console.error('   Add SUPABASE_SERVICE_ROLE_KEY=your-service-role-key to your .env file');
  console.error('   (Find it in Supabase Dashboard → Settings → API → service_role secret)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ─── Puzzle Data ───
const puzzles = [
  {
    id: "puz_001", number: 1, title: "Coffee Shop Spill", theme: "small_chain_reaction", status: "approved",
    cards: [
      { id: "a", text: "A customer swings a backpack near the counter." },
      { id: "b", text: "An iced coffee tips onto the card reader." },
      { id: "c", text: "The cashier yanks the plug from the wall." },
      { id: "d", text: "The payment screen goes completely black." },
      { id: "e", text: "The line stops moving almost instantly." },
      { id: "f", text: "Someone quietly asks if cash still works." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_002", number: 2, title: "Wrong Door Entrance", theme: "public_embarrassment", status: "approved",
    cards: [
      { id: "a", text: "A person checks a room number while walking." },
      { id: "b", text: "They push open the door without slowing down." },
      { id: "c", text: "A slideshow glows at the front of the room." },
      { id: "d", text: "Every head turns toward the doorway at once." },
      { id: "e", text: "Their greeting stops halfway through the first word." },
      { id: "f", text: "The door closes very carefully behind them." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_003", number: 3, title: "Birthday Cake Collapse", theme: "party_disaster", status: "approved",
    cards: [
      { id: "a", text: "Someone hides behind the conference room door." },
      { id: "b", text: "The lights get switched off on purpose." },
      { id: "c", text: "The birthday person opens the door." },
      { id: "d", text: "Everyone jumps out and shouts together." },
      { id: "e", text: "The cake tilts hard to one side." },
      { id: "f", text: "Frosting hits the floor before the plate." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_004", number: 4, title: "Baggage Carousel Fake-Out", theme: "travel_mishap", status: "approved",
    cards: [
      { id: "a", text: "A black suitcase rolls onto the carousel." },
      { id: "b", text: "Someone lifts it off with total confidence." },
      { id: "c", text: "The handle feels slightly wrong in one hand." },
      { id: "d", text: "A luggage tag swings into full view." },
      { id: "e", text: "The name on it is definitely not theirs." },
      { id: "f", text: "The suitcase goes back onto the belt immediately." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_005", number: 5, title: "Desk Plant Disaster", theme: "office_chaos", status: "approved",
    cards: [
      { id: "a", text: "A tiny desk plant starts looking dramatically dry." },
      { id: "b", text: "Someone tilts a water bottle over the soil." },
      { id: "c", text: "The stream keeps pouring one second too long." },
      { id: "d", text: "Water spills through the drainage tray." },
      { id: "e", text: "It reaches the corner of the keyboard." },
      { id: "f", text: "The plant suddenly seems less important." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_006", number: 6, title: "Library Bottle Drop", theme: "public_embarrassment", status: "approved",
    cards: [
      { id: "a", text: "A quiet library aisle settles completely still." },
      { id: "b", text: "Someone tucks a metal bottle under one arm." },
      { id: "c", text: "The bottle slips against a book spine." },
      { id: "d", text: "It hits the floor with impossible volume." },
      { id: "e", text: "The noise echoes farther than seems fair." },
      { id: "f", text: "A whispered sorry follows no one asked for." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_007", number: 7, title: "Group Chat Catastrophe", theme: "social_mishap", status: "approved",
    cards: [
      { id: "a", text: "Someone means to text one friend privately." },
      { id: "b", text: "They type a brutal opinion too quickly." },
      { id: "c", text: "The message goes into the full group chat." },
      { id: "d", text: "Three dots appear immediately." },
      { id: "e", text: "A screenshot gets posted back into the chat." },
      { id: "f", text: "Nobody talks for six minutes." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_009", number: 9, title: "Conference Badge Twist", theme: "office_chaos", status: "approved",
    cards: [
      { id: "a", text: "Someone walks into a crowded networking break." },
      { id: "b", text: "Their badge flips backward on its lanyard." },
      { id: "c", text: "A new person leans in for an introduction." },
      { id: "d", text: "The wrong company logo faces outward." },
      { id: "e", text: "A very confident assumption gets made aloud." },
      { id: "f", text: "The badge gets turned around a second too late." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_010", number: 10, title: "Photo Booth Blink", theme: "party_disaster", status: "approved",
    cards: [
      { id: "a", text: "Four friends squeeze into a photo booth." },
      { id: "b", text: "The countdown begins above the tiny screen." },
      { id: "c", text: "Everyone finally holds a decent pose." },
      { id: "d", text: "One person sneezes at the flash." },
      { id: "e", text: "The printed strip starts sliding out below." },
      { id: "f", text: "Every frame is somehow worse than expected." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_012", number: 12, title: "Parking Meter Scramble", theme: "travel_mishap", status: "approved",
    cards: [
      { id: "a", text: "A phone buzzes inside a checkout line." },
      { id: "b", text: "A parking app warning fills the screen." },
      { id: "c", text: "Someone glances toward the front windows." },
      { id: "d", text: "A meter officer appears down the block." },
      { id: "e", text: "The basket gets abandoned beside the candy rack." },
      { id: "f", text: "The sprint starts before the receipt could." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_018", number: 18, title: "Presentation Freeze", theme: "office_chaos", status: "approved",
    cards: [
      { id: "a", text: "The meeting room finally goes quiet." },
      { id: "b", text: "A laptop gets plugged into the projector cable." },
      { id: "c", text: "The desktop appears instead of the slides." },
      { id: "d", text: "Wrong windows start opening in a hurry." },
      { id: "e", text: "A calendar alert fills the screen." },
      { id: "f", text: "Everyone reads it before anyone looks away." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_019", number: 19, title: "Taxi Trunk Mix-Up", theme: "travel_mishap", status: "approved",
    cards: [
      { id: "a", text: "A taxi trunk opens at a busy curb." },
      { id: "b", text: "Two nearly identical suitcases sit side by side." },
      { id: "c", text: "One passenger grabs the wrong handle first." },
      { id: "d", text: "The other passenger says wait at the same time." },
      { id: "e", text: "Both look down at the luggage tags." },
      { id: "f", text: "A fast, awkward suitcase swap follows." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_new_002", number: 102, title: "Checkout Banana Roll", theme: "food_fail", status: "approved",
    cards: [
      { id: "a", text: "A banana gets set on the checkout ledge." },
      { id: "b", text: "The ledge slopes more than anyone notices." },
      { id: "c", text: "The banana begins a slow determined roll." },
      { id: "d", text: "Someone lunges with a wallet still in hand." },
      { id: "e", text: "The banana drops neatly into another cart." },
      { id: "f", text: "Both shoppers stare at it for one strange second." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_new_004", number: 104, title: "Printer Paper Storm", theme: "office_chaos", status: "approved",
    cards: [
      { id: "a", text: "A fresh ream of paper gets opened too quickly." },
      { id: "b", text: "The stack slips against the copier lid." },
      { id: "c", text: "Half the pages fan across the floor." },
      { id: "d", text: "The copier starts beeping for paper anyway." },
      { id: "e", text: "Someone crouches to gather pages with a sigh." },
      { id: "f", text: "One sheet sticks to the bottom of a shoe." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_new_005", number: 105, title: "Picnic Plate Disaster", theme: "party_disaster", status: "approved",
    cards: [
      { id: "a", text: "A paper plate gets loaded a little too confidently." },
      { id: "b", text: "One extra scoop lands near the edge." },
      { id: "c", text: "The center of the plate starts sagging downward." },
      { id: "d", text: "Both hands rush underneath much too late." },
      { id: "e", text: "Potato salad lands first on one shoe." },
      { id: "f", text: "The rest of lunch follows a second later." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_new_007", number: 107, title: "Smoothie Lid Failure", theme: "food_fail", status: "approved",
    cards: [
      { id: "a", text: "A smoothie gets passed across the café counter." },
      { id: "b", text: "The lid is pressed on almost all the way." },
      { id: "c", text: "Someone grabs the cup by the top edge." },
      { id: "d", text: "The lid lifts off with the straw still in it." },
      { id: "e", text: "A pink splash lands across one sleeve." },
      { id: "f", text: "The cup gets lowered much more carefully after that." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_new_008", number: 108, title: "Conference Room Chair", theme: "office_chaos", status: "approved",
    cards: [
      { id: "a", text: "Someone reaches the last chair in the room." },
      { id: "b", text: "They sit before checking the wheel lock." },
      { id: "c", text: "The chair glides backward farther than expected." },
      { id: "d", text: "One shoe scrapes hard against the floor." },
      { id: "e", text: "A coffee cup gets saved at the last second." },
      { id: "f", text: "The meeting continues as if nobody saw that." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_new_009", number: 109, title: "Museum Bench Mistake", theme: "public_embarrassment", status: "approved",
    cards: [
      { id: "a", text: "Someone spots an empty bench in a gallery room." },
      { id: "b", text: "They lower themselves toward it with relief." },
      { id: "c", text: "A quiet voice says please do not sit there." },
      { id: "d", text: "They realize it is part of the exhibit." },
      { id: "e", text: "Two nearby visitors suddenly study the wall instead." },
      { id: "f", text: "Standing feels much more deliberate after that." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_new_016", number: 116, title: "Birthday Candle Smoke", theme: "party_disaster", status: "approved",
    cards: [
      { id: "a", text: "The final candle gets blown out successfully." },
      { id: "b", text: "One napkin lands too close to the wick." },
      { id: "c", text: "A thin curl of smoke rises from the edge." },
      { id: "d", text: "Someone notices it half a second too late." },
      { id: "e", text: "A hand starts smacking the napkin in panic." },
      { id: "f", text: "The birthday song ends in confused applause." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_new_017", number: 117, title: "Train Ticket Pocket", theme: "travel_mishap", status: "approved",
    cards: [
      { id: "a", text: "A conductor starts checking tickets down the row." },
      { id: "b", text: "Someone reaches confidently for one jacket pocket." },
      { id: "c", text: "That pocket is completely empty." },
      { id: "d", text: "A second pocket gets checked much faster." },
      { id: "e", text: "The ticket appears folded behind a receipt." },
      { id: "f", text: "The smile of relief arrives a second too late." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_new_021", number: 121, title: "Raincoat Pocket Leak", theme: "small_chain_reaction", status: "approved",
    cards: [
      { id: "a", text: "A dripping umbrella gets folded under one arm." },
      { id: "b", text: "Its tip slides into a raincoat pocket opening." },
      { id: "c", text: "Water starts pooling where a hand expects keys." },
      { id: "d", text: "The pocket gets checked with growing confusion." },
      { id: "e", text: "A cold wet hand comes back out." },
      { id: "f", text: "The umbrella suddenly gets held much farther away." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  },
  {
    id: "puz_new_022", number: 122, title: "Checkout Divider Mix-Up", theme: "public_embarrassment", status: "approved",
    cards: [
      { id: "a", text: "Two shoppers unload groceries onto the belt." },
      { id: "b", text: "Nobody places the divider between the piles." },
      { id: "c", text: "The cashier scans straight through both groups." },
      { id: "d", text: "A stranger's yogurt appears on the wrong total." },
      { id: "e", text: "Both shoppers speak at exactly the same time." },
      { id: "f", text: "The divider arrives far too late to help." }
    ],
    correct_order: ["a", "b", "c", "d", "e", "f"]
  }
];

// Schedule: today (2026-03-23) through the next 20 days
const schedule: Record<string, string> = {
  "2026-03-22": "puz_001",
  "2026-03-23": "puz_002",
  "2026-03-24": "puz_003",
  "2026-03-25": "puz_004",
  "2026-03-26": "puz_005",
  "2026-03-27": "puz_006",
  "2026-03-28": "puz_007",
  "2026-03-29": "puz_009",
  "2026-03-30": "puz_010",
  "2026-03-31": "puz_012",
  "2026-04-01": "puz_018",
  "2026-04-02": "puz_019",
  "2026-04-03": "puz_new_002",
  "2026-04-04": "puz_new_004",
  "2026-04-05": "puz_new_005",
  "2026-04-06": "puz_new_007",
  "2026-04-07": "puz_new_008",
  "2026-04-08": "puz_new_009",
  "2026-04-09": "puz_new_016",
  "2026-04-10": "puz_new_017",
  "2026-04-11": "puz_new_021",
  "2026-04-12": "puz_new_022",
};

async function seed() {
  console.log('🌱 Seeding puzzles...');
  
  // Insert all puzzles
  const { error: puzzleError } = await supabase
    .from('puzzles')
    .upsert(puzzles.map(p => ({
      ...p,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })), { onConflict: 'id' });

  if (puzzleError) {
    console.error('❌ Failed to insert puzzles:', puzzleError);
    process.exit(1);
  }
  console.log(`✅ Inserted ${puzzles.length} puzzles`);

  // Insert schedule
  const scheduleRows = Object.entries(schedule).map(([date, puzzleId]) => ({
    date,
    puzzle_id: puzzleId,
  }));

  const { error: scheduleError } = await supabase
    .from('schedule')
    .upsert(scheduleRows, { onConflict: 'date' });

  if (scheduleError) {
    console.error('❌ Failed to insert schedule:', scheduleError);
    process.exit(1);
  }
  console.log(`✅ Inserted ${scheduleRows.length} schedule entries`);

  // Verify today's puzzle
  const { data: todayData } = await supabase.rpc('get_today_puzzle');
  if (todayData) {
    console.log(`\n🎮 Today's puzzle: "${todayData.title}" (${todayData.id})`);
  } else {
    console.log('\n⚠️  No puzzle found for today via RPC — check schedule dates');
  }

  console.log('\n🎉 Seed complete!');
}

seed();
