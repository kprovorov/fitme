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

  if (!process.env.E2E_SEED) {
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
  }

  if (process.env.E2E_SEED) {
    const client = new Client({
      connectionString:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:54322/postgres",
    });
    await client.connect();
    await client.query(`
      DO $$
      DECLARE
        v_user_id uuid;
        v_plan_id uuid := gen_random_uuid();
      BEGIN
        -- Create user if not exists
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'tony@stark.com') THEN
          v_user_id := gen_random_uuid();
          INSERT INTO auth.users
            (id, instance_id, email, encrypted_password, email_confirmed_at,
             created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
             aud, role, confirmation_token, email_change, email_change_token_new, recovery_token)
          VALUES
            (v_user_id, '00000000-0000-0000-0000-000000000000', 'tony@stark.com',
             crypt('secret', gen_salt('bf')), now(), now(), now(),
             '{"provider":"email","providers":["email"]}', '{}',
             'authenticated', 'authenticated', '', '', '', '');
          INSERT INTO auth.identities
            (id, user_id, identity_data, provider, provider_id, created_at, updated_at, last_sign_in_at)
          VALUES
            (gen_random_uuid(), v_user_id,
             jsonb_build_object('sub', v_user_id::text, 'email', 'tony@stark.com', 'email_verified', true),
             'email', v_user_id::text, now(), now(), now());
        ELSE
          SELECT id INTO v_user_id FROM auth.users WHERE email = 'tony@stark.com';
        END IF;

        -- Create profile if not exists
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_user_id) THEN
          INSERT INTO public.profiles (user_id, gender, age, weight, height, measurement_system)
          VALUES (v_user_id, 'male', 30, 80, 180, 'metric');
        END IF;

        -- Delete existing E2E plans and recreate
        DELETE FROM public.plans WHERE user_id = v_user_id AND name = 'E2E Test Plan';

        INSERT INTO public.plans (id, user_id, name, goal, place, frequency, is_active, experience_level, workout_duration)
        VALUES (v_plan_id, v_user_id, 'E2E Test Plan', 'muscle-gain', 'gym', 3, true, 'beginner', 60);

        INSERT INTO public.workouts (plan_id, "order", name, description)
        VALUES
          (v_plan_id, 1, 'E2E Workout A', 'E2E test workout A'),
          (v_plan_id, 2, 'E2E Workout B', 'E2E test workout B');
      END $$;
    `);
    // Helper SQL to create an auth user
    const createUser = async (email: string) => {
      await client.query(`
        DO $$
        DECLARE v_id uuid;
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '${email}') THEN
            v_id := gen_random_uuid();
            INSERT INTO auth.users
              (id, instance_id, email, encrypted_password, email_confirmed_at,
               created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
               aud, role, confirmation_token, email_change, email_change_token_new, recovery_token)
            VALUES
              (v_id, '00000000-0000-0000-0000-000000000000', '${email}',
               crypt('secret', gen_salt('bf')), now(), now(), now(),
               '{"provider":"email","providers":["email"]}', '{}',
               'authenticated', 'authenticated', '', '', '', '');
            INSERT INTO auth.identities
              (id, user_id, identity_data, provider, provider_id, created_at, updated_at, last_sign_in_at)
            VALUES
              (gen_random_uuid(), v_id,
               jsonb_build_object('sub', v_id::text, 'email', '${email}', 'email_verified', true),
               'email', v_id::text, now(), now(), now());
          END IF;
        END $$;
      `);
    };

    // onboarding@fitme.test — auth user but NO profile (used by complete-onboarding + create-plan tests)
    await createUser("onboarding@fitme.test");
    await client.query(`
      DELETE FROM public.profiles
      WHERE user_id = (SELECT id FROM auth.users WHERE email = 'onboarding@fitme.test');
    `);

    // planner@fitme.test — has profile but NO plans (used by create-plan test after onboarding)
    await createUser("planner@fitme.test");
    await client.query(`
      DO $$
      DECLARE v_pid uuid;
      BEGIN
        v_pid := (SELECT id FROM auth.users WHERE email = 'planner@fitme.test');
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_pid) THEN
          INSERT INTO public.profiles (user_id, gender, age, weight, height, measurement_system)
          VALUES (v_pid, 'male', 30, 80, 180, 'metric');
        END IF;
        DELETE FROM public.plans WHERE user_id = v_pid;
      END $$;
    `);

    // e2e-register@fitme.test — deleted each run so register test can create it fresh
    await client.query(`
      DELETE FROM auth.identities
      WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'e2e-register@fitme.test');
      DELETE FROM auth.users WHERE email = 'e2e-register@fitme.test';
    `);

    await client.end();
    console.log(
      "E2E test users seeded (tony@stark.com, onboarding@fitme.test, planner@fitme.test).",
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
