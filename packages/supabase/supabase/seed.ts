import fs from "node:fs";
import path from "node:path";
import { createSeedClient } from "@snaplet/seed";
import { parse } from "csv-parse/sync";

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
    "utf-8"
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
      description: readMarkdownFile("data/descriptions", row.slug),
      instructions: readMarkdownFile("data/instructions", row.slug),
      muscle_groups: row.muscle_groups.split(",").map((g) => g.trim()),
      name: row.name,
      slug: row.slug,
      thumbnail_url: row.thumbnail_url,
      video_url: row.video_url,
    }))
  );

  console.log(`Seeded ${rows.length} exercises.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
