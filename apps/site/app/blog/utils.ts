import fs from "node:fs";
import path from "node:path";

const FRONTMATTER_REGEX = /---\s*([\s\S]*?)\s*---/;
const QUOTED_VALUE_REGEX = /^['"](.*)['"]$/;

interface Metadata {
  publishedAt: string;
  summary: string;
  title: string;
}

export interface BlogPost {
  content: string;
  metadata: Metadata;
  slug: string;
}

function parseFrontmatter(fileContent: string) {
  const [, frontMatterBlock] = fileContent.match(FRONTMATTER_REGEX) ?? [];
  if (frontMatterBlock === undefined) {
    throw new Error("Blog post is missing a frontmatter block");
  }
  const content = fileContent.replace(FRONTMATTER_REGEX, "").trim();
  const metadata: Partial<Metadata> = {};

  for (const line of frontMatterBlock.trim().split("\n")) {
    const [key, ...valueParts] = line.split(": ");
    const value = valueParts
      .join(": ")
      .trim()
      .replace(QUOTED_VALUE_REGEX, "$1");
    metadata[key.trim() as keyof Metadata] = value;
  }

  return { content, metadata: metadata as Metadata };
}

function getMDXFiles(dir: string) {
  return fs.readdirSync(dir).filter((file) => path.extname(file) === ".mdx");
}

function readMDXFile(filePath: string) {
  const rawContent = fs.readFileSync(filePath, "utf-8");
  return parseFrontmatter(rawContent);
}

function getMDXData(dir: string): BlogPost[] {
  return getMDXFiles(dir).map((file) => {
    const { metadata, content } = readMDXFile(path.join(dir, file));
    const slug = path.basename(file, path.extname(file));

    return { content, metadata, slug };
  });
}

export function getBlogPosts() {
  return getMDXData(path.join(process.cwd(), "blog"));
}
