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
      { href: "/#arnold", title: "Arnold" },
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

const currentYear = new Date().getFullYear();

const Footer = () => (
  <footer className="w-full border-t py-16">
    <Container className="flex flex-col">
      <div className="mb-12 grid gap-12 lg:grid-cols-[1.5fr_2fr]">
        <div className="flex flex-col items-start gap-5">
          <Link href="/">
            <Image alt="Fitme" height={30} src="/logo.svg" width={100} />
          </Link>
          <p className="text-muted-foreground max-w-80">
            The AI workout tracker and fitness coach for iPhone. Plan, train and
            see your progress in one app.
          </p>
          <AppStoreBadge />
        </div>
        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-8 sm:grid-cols-3"
        >
          {columns.map((column) => (
            <div className="flex flex-col gap-4" key={column.title}>
              <h2 className="text-foreground text-subhead-emphasized">
                {column.title}
              </h2>
              <ul className="flex flex-col">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      className="text-muted-foreground text-subhead hover:text-foreground inline-flex min-h-11 items-center transition-colors"
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
      <div className="text-footnote text-muted-foreground flex flex-col-reverse items-start justify-between gap-6 border-t pt-8 sm:flex-row sm:items-center">
        <p>© {currentYear} Kyrylo Provorov. Made in Europe.</p>
        <ul className="flex items-center gap-2">
          {socialLinks.map((link) => (
            <li key={link.id}>
              <a
                aria-label={link.label}
                className="group hover:border-muted-foreground flex size-11 items-center justify-center rounded-full border transition-colors"
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

export default Footer;
