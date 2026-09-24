import type { MetadataRoute } from "next";
import { getBlogPosts } from "./blog/utils";

export default function sitemap(): MetadataRoute.Sitemap {
  const blogPosts = getBlogPosts();

  const staticPages = [
    {
      changeFrequency: "monthly" as const,
      lastModified: new Date(),
      priority: 1,
      url: "https://fitmeproject.com",
    },
    {
      changeFrequency: "monthly" as const,
      lastModified: new Date(),
      priority: 0.5,
      url: "https://fitmeproject.com/support",
    },
    {
      changeFrequency: "weekly" as const,
      lastModified: new Date(),
      priority: 0.7,
      url: "https://fitmeproject.com/blog",
    },
  ];

  const blogPostPages = blogPosts.map((post) => ({
    changeFrequency: "monthly" as const,
    lastModified: new Date(post.metadata.publishedAt),
    priority: 0.8,
    url: `https://fitmeproject.com/blog/${post.slug}`,
  }));

  return [...staticPages, ...blogPostPages];
}
