import Image from "next/image";
import Link from "next/link";

const footerLinks = [
  { href: "/blog", title: "Blog" },
  { href: "/support", title: "Support" },
  { href: "/privacy-policy", title: "Privacy Policy" },
  { href: "/terms", title: "Terms of Service" },
];

const socialLinks = [
  {
    alt: "Fitme on X (Twitter)",
    href: process.env.NEXT_PUBLIC_TWITTER_URL,
    id: "twitter",
  },
  {
    alt: "Fitme on Threads",
    href: process.env.NEXT_PUBLIC_THREADS_URL,
    id: "threads",
  },
  {
    alt: "Fitme on Instagram",
    href: process.env.NEXT_PUBLIC_INSTAGRAM_URL,
    id: "instagram",
  },
].filter((link) => link.href);

function Footer() {
  return (
    <footer className="border-border border-t text-muted-foreground text-sm">
      <div className="container flex flex-col gap-8 py-10 md:flex-row md:items-center md:justify-between">
        <p>Kyrylo Provorov © {new Date().getFullYear()}. Made in Europe.</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-1">
          {footerLinks.map((link) => (
            <Link
              className="rounded-sm py-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              href={link.href}
              key={link.href}
            >
              {link.title}
            </Link>
          ))}
        </nav>
        {socialLinks.length > 0 ? (
          <div className="flex gap-1">
            {socialLinks.map((link) => (
              <a
                aria-label={link.alt}
                className="group grid size-11 place-items-center rounded-full hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
                href={link.href}
                key={link.id}
                rel="noopener"
                target="_blank"
              >
                <Image
                  alt=""
                  className="opacity-50 group-hover:opacity-100"
                  height={18}
                  src={`/social/${link.id}.icon.svg`}
                  width={18}
                />
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </footer>
  );
}

export default Footer;
