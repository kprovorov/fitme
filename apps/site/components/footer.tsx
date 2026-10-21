import Image from "next/image";
import Link from "next/link";

import { socialLinks } from "@/lib/site";
import { AppStoreBadge } from "./app-store-badge";
import { Container } from "./ui/container";

const columns = [
  {
    links: [
      { href: "/#how-it-works", title: "How it works" },
      { href: "/#features", title: "Features" },
      { href: "/#coach", title: "AI Coach" },
      { href: "/#faq", title: "FAQ" },
    ],
    title: "Product",
  },
  {
    links: [
      { href: "/blog", title: "Blog" },
      { href: "/support", title: "Support" },
    ],
    title: "Resources",
  },
  {
    links: [
      { href: "/privacy-policy", title: "Privacy Policy" },
      { href: "/terms", title: "Terms of Service" },
    ],
    title: "Legal",
  },
];

function Footer() {
  return (
    <footer className="w-full border-t">
      <Container className="flex flex-col gap-12 py-16">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_2fr]">
          <div className="flex flex-col items-start gap-5">
            <Link href="/">
              <Image alt="Fitme" height={30} src="/logo.svg" width={100} />
            </Link>
            <p className="max-w-80 text-muted-foreground">
              The AI workout tracker and fitness coach for iPhone. Plan, train
              and see your progress in one app.
            </p>
            <AppStoreBadge />
          </div>
          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-8 sm:grid-cols-3"
          >
            {columns.map((column) => (
              <div className="flex flex-col gap-4" key={column.title}>
                <h2 className="font-bold text-foreground text-subhead">
                  {column.title}
                </h2>
                <ul className="flex flex-col">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        className="inline-flex min-h-11 items-center text-muted-foreground text-subhead transition-colors hover:text-foreground"
                        href={link.href}
                      >
                        {link.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="flex flex-col-reverse items-start justify-between gap-6 border-t pt-8 text-footnote text-muted-foreground sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Kyrylo Provorov. Made in Europe.</p>
          <ul className="flex items-center gap-2">
            {socialLinks.map((link) => (
              <li key={link.id}>
                <a
                  aria-label={link.label}
                  className="group flex size-11 items-center justify-center rounded-full border transition-colors hover:border-muted-foreground"
                  href={link.href}
                  rel="noopener"
                  target="_blank"
                >
                  <Image
                    alt=""
                    className="opacity-60 transition-opacity group-hover:opacity-100"
                    height={16}
                    src={`/social/${link.id}.icon.svg`}
                    width={16}
                  />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </footer>
  );
}

export default Footer;
