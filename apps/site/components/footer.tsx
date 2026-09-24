import Image from "next/image";
import Link from "next/link";
import { HStack } from "./ui/hstack";

function Footer() {
  const footerLinks = [
    { href: "/blog", title: "Blog" },
    { href: "/support", title: "Support" },
    { href: "/privacy-policy", title: "Privacy Policy" },
    { href: "/terms", title: "Terms of Service" },
  ];

  const socialLinks = [
    {
      alt: "Follow us on X (Twitter)",
      href: process.env.NEXT_PUBLIC_TWITTER_URL,
      id: "twitter",
    },
    {
      alt: "Follow us on Threads",
      href: process.env.NEXT_PUBLIC_THREADS_URL,
      id: "threads",
    },
    {
      alt: "Follow us on Instagram",
      href: process.env.NEXT_PUBLIC_INSTAGRAM_URL,
      id: "instagram",
    },
  ];

  return (
    <footer className="p-3 text-muted-foreground text-xs">
      <HStack className="h-full flex-col justify-between md:flex-row">
        <HStack>
          <span>Kyrylo Provorov © {new Date().getFullYear()}</span>
          <span>|</span>
          <HStack className="gap-1">
            <span>Made in Europe</span>
            <span className="text-xl">🇪🇺</span>
          </HStack>
        </HStack>
        <HStack className="gap-4">
          {socialLinks.map((link) => (
            <a
              className="hover:text-foreground"
              href={link.href}
              key={link.href}
              rel="noopener"
              target="_blank"
            >
              <Image
                alt={link.alt}
                className="opacity-40 hover:opacity-100"
                height={18}
                src={`/social/${link.id}.icon.svg`}
                width={18}
              />
            </a>
          ))}
        </HStack>
        <HStack>
          {footerLinks.map((link) => (
            <Link
              className="hover:text-foreground"
              href={link.href}
              key={link.href}
            >
              {link.title}
            </Link>
          ))}
        </HStack>
      </HStack>
    </footer>
  );
}

export default Footer;
