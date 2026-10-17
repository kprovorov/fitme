export const appStoreUrl =
  process.env.NEXT_PUBLIC_APPSTORE_URL ||
  "https://apps.apple.com/app/apple-store/id6741153628";

export const navLinks = [
  { href: "/#features", title: "Features" },
  { href: "/#faq", title: "FAQ" },
  { href: "/blog", title: "Blog" },
  { href: "/support", title: "Support" },
];

export const socialLinks = [
  {
    href: process.env.NEXT_PUBLIC_TWITTER_URL,
    id: "twitter",
    label: "Fitme on X (Twitter)",
  },
  {
    href: process.env.NEXT_PUBLIC_THREADS_URL,
    id: "threads",
    label: "Fitme on Threads",
  },
  {
    href: process.env.NEXT_PUBLIC_INSTAGRAM_URL,
    id: "instagram",
    label: "Fitme on Instagram",
  },
].filter((link): link is typeof link & { href: string } => !!link.href);
