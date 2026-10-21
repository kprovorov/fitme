import moment from "moment";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote-client/rsc";
import { ProseArticle } from "@/components/prose";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { getBlogPosts } from "../utils";

const baseUrl = "https://fitmeproject.com";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getBlogPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  const post = getBlogPosts().find((item) => item.slug === slug);

  if (!post) {
    notFound();
  }

  const { title, publishedAt, summary } = post.metadata;

  const image = `${baseUrl}/blog/${publishedAt}.png`;

  return {
    description: summary,
    openGraph: {
      description: summary,
      images: [
        {
          url: image,
        },
      ],
      publishedTime: publishedAt,
      title,
      type: "article",
      url: `${baseUrl}/blog/${post.slug}`,
    },
    title,
    twitter: {
      card: "summary_large_image",
      description: summary,
      images: [image],
      title,
    },
  };
}

export default async function Blog({ params }: Props) {
  const { slug } = await params;

  const post = getBlogPosts().find((item) => item.slug === slug);

  if (!post) {
    notFound();
  }

  return (
    <Container className="max-w-3xl">
      <VStack className="items-start gap-10">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/blog">Blog</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{post.metadata.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div>
          <span className="text-caption-1 text-muted-foreground">
            {moment(post.metadata.publishedAt).format("MMMM D, YYYY")}
          </span>
          <ProseArticle>
            <h1>{post.metadata.title}</h1>
            <Image
              alt={post.metadata.title}
              className="rounded-xl"
              height={400}
              src={`/blog/${post.metadata.publishedAt}.png`}
              width={800}
            />
            <p className="lead">{post.metadata.summary}</p>
            <MDXRemote source={post.content} />
          </ProseArticle>
        </div>
        <HStack className="justify-start gap-2">
          <Image
            alt={"Kirill Provorov"}
            className="rounded-full"
            height={50}
            src={"https://github.com/kprovorov.png"}
            width={50}
          />

          <VStack className="items-start gap-0">
            <span className="font-medium">Kirill Provorov</span>
            <a className="text-subhead" href={"https://x.com/kprovorov"}>
              @kprovorov
            </a>
          </VStack>
        </HStack>
      </VStack>
    </Container>
  );
}
