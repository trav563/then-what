import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function wipe() {
  console.log("Fetching scheduled puzzles...");
  const { data: scheduleData, error: sErr } = await supabase.from('schedule').select('puzzle_id');
  if (sErr) throw sErr;
  
  const scheduledIds = scheduleData.map(r => r.puzzle_id);
  console.log("Scheduled ids:", scheduledIds.length);

  console.log("Deleting all puzzles not in schedule or published...");
  const { data, error } = await supabase
    .from('puzzles')
    .delete()
    .not('id', 'in', `(${scheduledIds.join(',')})`)
    .neq('status', 'published');
    
  if (error) {
    console.error("Error deleting:", error);
  } else {
    console.log("Successfully wiped un-scheduled puzzles.");
  }
}
wipe();
