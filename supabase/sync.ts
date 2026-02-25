import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";

function readMarkdownFile(dir: string, slug: string): string | null {
  const filePath = path.join(process.cwd(), dir, `${slug}.md`);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf-8").trim();
  }
  return null;
}

async function main() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables",
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

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

  const exercises = rows.map((row) => ({
    name: row.name,
    slug: row.slug,
    video_url: row.video_url,
    thumbnail_url: row.thumbnail_url,
    muscle_groups: row.muscle_groups.split(",").map((g) => g.trim()),
    description: readMarkdownFile("data/descriptions", row.slug),
    instructions: readMarkdownFile("data/instructions", row.slug),
  }));

  const { error } = await supabase
    .from("exercises")
    .upsert(exercises, { onConflict: "slug" });

  if (error) throw error;

  console.log(`Synced ${exercises.length} exercises.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
