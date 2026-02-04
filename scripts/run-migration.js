const { Client } = require('pg');
const fs = require('fs');

const connectionString = 'postgresql://postgres.diaroeomiyinntmjrpuw:' + 
  fs.readFileSync('.env', 'utf8')
    .split('\n')
    .find(line => line.startsWith('SUPABASE_SERVICE_ROLE_KEY='))
    .split('=')[1]
    .trim() + 
  '@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres';

const client = new Client({ connectionString });

async function runMigration() {
  try {
    await client.connect();
    console.log('Connected to Supabase');

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
      SELECT DISTINCT up.id, generate_series, ''
      FROM user_profiles up
      CROSS JOIN LATERAL generate_series(1, 10) AS generate_series
      LEFT JOIN user_memory_slots ums ON up.id = ums.user_id AND ums.slot_number = generate_series
      WHERE ums.id IS NULL;

      ALTER TABLE user_memory_slots ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "Allow all for PoC - memory slots" ON user_memory_slots;
      CREATE POLICY "Allow all for PoC - memory slots" ON user_memory_slots
        FOR ALL USING (true) WITH CHECK (true);
    `;

    await client.query(sql);
    console.log('✅ Migration completed successfully!');
    
    const result = await client.query('SELECT COUNT(*) FROM user_memory_slots');
    console.log(`✅ Total memory slots: ${result.rows[0].count}`);
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

runMigration();
