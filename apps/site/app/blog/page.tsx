import moment from "moment";
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
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { getBlogPosts } from "./utils";

function Page() {
  const posts = getBlogPosts();

  return (
    <Container className="max-w-3xl">
      <VStack className="items-start gap-8">
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
        <VStack className="gap-20">
          {posts.map((post) => (
            <VStack className="w-full items-start" key={post.slug}>
              <HStack className="w-full justify-between font-fredoka text-sm">
                <HStack className="justify-start gap-2">
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
                </HStack>
                <span className="text-neutral-400 text-xs">
                  {moment(post.metadata.publishedAt).format("MMMM D, YYYY")}
                </span>
              </HStack>

              <Link className="hover:underline" href={`/blog/${post.slug}`}>
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
        </VStack>
      </VStack>
    </Container>
  );
}

export default Page;
