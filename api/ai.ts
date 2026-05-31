import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { fetchExistingPuzzles, backfillEmbeddings, runGenerate, runEvaluate } from '../src/services/aiCore';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
  }

  // Verify the request has a valid Supabase auth token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured on server' });
  }

  // Verify the JWT with Supabase
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: supabaseServiceKey }
  });

  if (!userRes.ok) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { action, settings, puzzle } = req.body;

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Whole history is off-limits — every status, including retired & rejected.
    const existing = await fetchExistingPuzzles(supabase);

    if (action === 'generate') {
      // Backfill embeddings for any historical puzzle that lacks one, so the
      // semantic check sees the full library.
      await backfillEmbeddings(supabase, existing);
      const result = await runGenerate(settings, existing);
      return res.status(200).json(result);
    } else if (action === 'evaluate') {
      const result = await runEvaluate(puzzle, existing);
      return res.status(200).json(result);
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "generate" or "evaluate".' });
    }
  } catch (error: any) {
    console.error('AI function error:', error);
    return res.status(500).json({ error: error.message || 'AI generation failed' });
  }
}
