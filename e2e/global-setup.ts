import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load .env.local before anything else
config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function globalSetup() {
  const email = `e2e-${Date.now()}@tradepilot.dev`;
  const password = 'E2eTestPass123!';

  // Create user with email auto-confirmed (bypass email verification)
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Test Bot' },
  });

  if (error) throw new Error(`Failed to create test user: ${error.message}`);

  // Write credentials to JSON file for tests
  fs.writeFileSync(
    'e2e/.auth.json',
    JSON.stringify({ email, password, userId: data.user!.id })
  );

  console.log(`✅ E2E test user created: ${email}`);
}

export default globalSetup;