import Image from "next/image";
import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { VStack } from "@/components/ui/vstack";

import { getBlogPosts } from "./utils";

const publishedDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

const Page = () => {
  const posts = getBlogPosts();

  return (
    <Container className="max-w-3xl">
      <div className="flex flex-col items-start justify-center gap-8">
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
          </BreadcrumbList>
        </Breadcrumb>
        <h1>Blog</h1>
        <div className="flex flex-col items-center justify-center gap-20">
          {posts.map((post) => (
            <VStack className="w-full items-start" key={post.slug}>
              <div className="text-subhead flex w-full items-center justify-between gap-3">
                <div className="flex items-center justify-start gap-2">
                  <Image
                    alt="Kirill Provorov"
                    className="rounded-full"
                    height={20}
                    src="https://github.com/kprovorov.png"
                    width={20}
                  />

                  <span>Kirill Provorov</span>
                  <a
                    className="text-muted-foreground"
                    href="https://x.com/kprovorov"
                  >
                    @kprovorov
                  </a>
                </div>
                <span className="text-caption-1 text-muted-foreground">
                  {publishedDateFormatter.format(
                    new Date(`${post.metadata.publishedAt}T00:00:00`)
                  )}
                </span>
              </div>

              <Link
                className="hover:underline"
                href={`/blog/${encodeURIComponent(post.slug)}`}
              >
                <h2>{post.metadata.title}</h2>
              </Link>

              <p>{post.metadata.summary} </p>

              <Image
                alt={post.metadata.title}
                className="rounded-xl"
                height={400}
                src={`/blog/${post.metadata.publishedAt}.png`}
                width={800}
              />
            </VStack>
          ))}
        </div>
      </div>
    </Container>
  );
};

export default Page;
