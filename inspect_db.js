import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Try to read .env.local from the current directory
let supabaseUrl = '';
let supabaseAnonKey = '';

try {
  const env = fs.readFileSync('e:/Web Development/office/Order-management/.env.local', 'utf8');
  supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1];
  supabaseAnonKey = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1];
} catch (e) {
  console.error('Failed to read .env.local');
}

if (supabaseUrl \u0026\u0026 supabaseAnonKey) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  async function inspect() {
    const { data, error } = await supabase.from('orders').select('*').limit(1);
    if (error) {
      console.error('Error:', error.message);
    } else {
      console.log('Columns:', Object.keys(data[0] || {}));
    }
  }
  inspect();
} else {
  console.error('Missing credentials');
}
