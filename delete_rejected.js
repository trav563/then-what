import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { error } = await supabase.from('puzzles').delete().eq('status', 'rejected');
  if (error) console.error("Error deleting:", error);
  else console.log("Successfully hard-deleted all rejected puzzles!");
}
run();
