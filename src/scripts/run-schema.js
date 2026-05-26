const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Read schemas (in order)
const schema1 = fs.readFileSync(
  path.join(__dirname, "../../supabase/migrations/20250101000000_initial_schema.sql"),
  "utf8"
);
const schema2 = fs.readFileSync(
  path.join(__dirname, "../../supabase/migrations/20250525000000_add_trading_mode.sql"),
  "utf8"
);
const schema = schema1 + "\n" + schema2;

const PASSWORD = "Soroni4ever9dr9!";

// Try multiple connection approaches
const configs = [
  {
    label: "Session Pooler (eu-west-1)",
    host: "aws-0-eu-west-1.pooler.supabase.com",
    port: 5432,
    user: "postgres.hnfgwffxqimatnjnlrzp",
  },
  {
    label: "Session Pooler (eu-central-1)",
    host: "aws-0-eu-central-1.pooler.supabase.com",
    port: 5432,
    user: "postgres.hnfgwffxqimatnjnlrzp",
  },
  {
    label: "Direct connection",
    host: "db.hnfgwffxqimatnjnlrzp.supabase.co",
    port: 5432,
    user: "postgres",
  },
  {
    label: "Transaction Pooler (eu-west-1)",
    host: "aws-0-eu-west-1.pooler.supabase.com",
    port: 6543,
    user: "postgres.hnfgwffxqimatnjnlrzp",
  },
];

async function tryConnect(config) {
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: "postgres",
    user: config.user,
    password: PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  try {
    const result = await pool.query("SELECT 1 AS ok");
    console.log(`✅ ${config.label}: CONNECTED -`, result.rows[0]);
    // Run schema
    console.log(`\nRunning schema on ${config.label}...`);
    await pool.query(schema);
    console.log("✅ Schema executed successfully!");
    return true;
  } catch (err) {
    console.log(`❌ ${config.label}:`, err.message.slice(0, 100));
    return false;
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log("🔍 Trying to connect to Supabase PostgreSQL...\n");

  for (const config of configs) {
    const ok = await tryConnect(config);
    if (ok) {
      console.log("\n🎉 Done! Database is set up.");
      process.exit(0);
    }
  }

  console.log("\n❌ Could not connect with any host/region.");
  console.log(
    "\nYou can run the schema manually at: https://supabase.com/dashboard/project/hnfgwffxqimatnjnlrzp/sql/new"
  );
  process.exit(1);
}

main();