import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('puzzles').select('title, is_true_story, fun_fact').eq('title', 'The Disappearing Presentation');
  console.log(JSON.stringify(data, null, 2));
}
check();
