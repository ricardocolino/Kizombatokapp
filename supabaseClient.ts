
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cxvqbhcrlpedvhvrqddx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JQPomQaK71IzMmCfGmSs2A_qPSwpxJW';

// This is a dummy key as requested by instructions (assume pre-configured)
// but using the provided public key from user request.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
