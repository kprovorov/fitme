import fs from "node:fs";
import path from "node:path";

const FRONTMATTER_REGEX = /---\s*(?<frontMatter>[\s\S]*?)\s*---/u;
const QUOTED_VALUE_REGEX = /^['"](?<value>.*)['"]$/u;

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

const parseFrontmatter = (fileContent: string) => {
  const [, frontMatterBlock] = FRONTMATTER_REGEX.exec(fileContent) ?? [];

  if (frontMatterBlock === undefined) {
    throw new Error("Blog post is missing a frontmatter block");
  }

  const content = fileContent.replace(FRONTMATTER_REGEX, "").trim();
  const metadata: Partial<Metadata> & Record<string, string> = {};

  for (const line of frontMatterBlock.trim().split("\n")) {
    const [key, ...valueParts] = line.split(": ");

    const value = valueParts
      .join(": ")
      .trim()
      .replace(QUOTED_VALUE_REGEX, "$<value>");

    metadata[key.trim()] = value;
  }

  // SAFETY: Repository-owned blog frontmatter supplies title, publishedAt and summary; each value is parsed as a string.
  return { content, metadata: metadata as Metadata };
};

const getMDXFiles = (dir: string) =>
  fs.readdirSync(dir).filter((file) => path.extname(file) === ".mdx");

const readMDXFile = (filePath: string) => {
  const rawContent = fs.readFileSync(filePath, "utf-8");

  return parseFrontmatter(rawContent);
};

const getMDXData = (dir: string): BlogPost[] =>
  getMDXFiles(dir).map((file) => {
    const { metadata, content } = readMDXFile(path.join(dir, file));
    const slug = path.basename(file, path.extname(file));

    return { content, metadata, slug };
  });

export const getBlogPosts = () => getMDXData(path.join(process.cwd(), "blog"));
