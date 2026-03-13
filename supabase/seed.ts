import { createSeedClient } from "@snaplet/seed";
import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";
import { Client } from "pg";

function readMarkdownFile(dir: string, slug: string): string | null {
  const filePath = path.join(process.cwd(), dir, `${slug}.md`);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf-8").trim();
  }
  return null;
}

async function main() {
  const csvContent = fs.readFileSync(
    path.join(process.cwd(), "data/exercises.csv"),
    "utf-8",
  );

  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as {
    ref: string;
    name: string;
    slug: string;
    video_url: string;
    thumbnail_url: string;
    muscle_groups: string;
  }[];

  const seed = await createSeedClient();

  await seed.exercises(
    rows.map((row) => ({
      name: row.name,
      slug: row.slug,
      video_url: row.video_url,
      thumbnail_url: row.thumbnail_url,
      muscle_groups: row.muscle_groups.split(",").map((g) => g.trim()),
      description: readMarkdownFile("data/descriptions", row.slug),
      instructions: readMarkdownFile("data/instructions", row.slug),
    })),
  );

  console.log(`Seeded ${rows.length} exercises.`);

  if (process.env.E2E_SEED) {
    const client = new Client({
      connectionString:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:54322/postgres",
    });
    await client.connect();
    await client.query(`
      DO $$
      DECLARE user_id uuid := gen_random_uuid();
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'tony@stark.com') THEN
          INSERT INTO auth.users
            (id, instance_id, email, encrypted_password, email_confirmed_at,
             created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
             aud, role, confirmation_token, email_change, email_change_token_new, recovery_token)
          VALUES
            (user_id, '00000000-0000-0000-0000-000000000000', 'tony@stark.com',
             crypt('secret', gen_salt('bf')), now(), now(), now(),
             '{"provider":"email","providers":["email"]}', '{}',
             'authenticated', 'authenticated', '', '', '', '');
          INSERT INTO auth.identities
            (id, user_id, identity_data, provider, provider_id, created_at, updated_at, last_sign_in_at)
          VALUES
            (gen_random_uuid(), user_id,
             jsonb_build_object('sub', user_id::text, 'email', 'tony@stark.com', 'email_verified', true),
             'email', user_id::text, now(), now(), now());
        END IF;
      END $$;
    `);
    await client.end();
    console.log("E2E test user created (tony@stark.com).");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
