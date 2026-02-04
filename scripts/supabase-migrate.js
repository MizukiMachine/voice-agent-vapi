// Use Supabase Management API to create table
// Requires: project ref and access token

const https = require('https');

const SERVICE_ROLE_KEY = require('fs').readFileSync('.env', 'utf8')
  .split('\n')
  .find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY='))
  .split('=')[1]
  .trim();

const options = {
  hostname: 'api.supabase.com',
  path: '/v1/projects/diaroeomiyinntmjrpuw/database/query',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  }
};

const sql = `
CREATE TABLE IF NOT EXISTS user_memory_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  slot_number INTEGER NOT NULL CHECK (slot_number BETWEEN 1 AND 10),
  content TEXT NOT NULL DEFAULT '' CHECK (LENGTH(content) <= 200),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_memory_slots_unique ON user_memory_slots(user_id, slot_number);
CREATE INDEX IF NOT EXISTS idx_user_memory_slots_user_id ON user_memory_slots(user_id);

INSERT INTO user_memory_slots (user_id, slot_number, content)
SELECT DISTINCT up.id, s, ''
FROM user_profiles up
CROSS JOIN generate_series(1, 10) s
LEFT JOIN user_memory_slots ums ON up.id = ums.user_id AND ums.slot_number = s
WHERE ums.id IS NULL;

ALTER TABLE user_memory_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for PoC - memory slots" ON user_memory_slots;
CREATE POLICY "Allow all for PoC - memory slots" ON user_memory_slots
  FOR ALL USING (true) WITH CHECK (true);

SELECT 'OK' as status;
`;

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      if (result.error) {
        console.error('Error:', result.error);
        process.exit(1);
      } else {
        console.log('✅ Migration completed!');
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (e) {
      console.log('Response:', data);
    }
  });
});

req.on('error', (err) => {
  console.error('❌ Request failed:', err.message);
  process.exit(1);
});

req.write(JSON.stringify({ sql }));
req.end();
