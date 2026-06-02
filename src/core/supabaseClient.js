import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hwsuphroilmzqclozpkp.supabase.co';
const supabaseAnonKey = 'sb_publishable_p7xhJJeIEzNhq6f2iPZgZg_57zKeQEJ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);