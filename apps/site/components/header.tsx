import Image from "next/image";
import Link from "next/link";
import { APPSTORE_URL } from "@/lib/site";
import { Button } from "./ui/button";

const links = [
  { href: "/blog", title: "Blog" },
  { href: "/support", title: "Support" },
];

function Header() {
  return (
    <header className="sticky top-0 z-50 border-border/60 border-b bg-background/85 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between gap-6">
        <Link
          className="rounded-sm focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
          href="/"
        >
          <Image alt="Fitme" height={30} priority src="/logo.svg" width={100} />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-2 sm:gap-6">
          {links.map((link) => (
            <Link
              className="hidden rounded-sm px-1 py-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary sm:inline"
              href={link.href}
              key={link.href}
            >
              {link.title}
            </Link>
          ))}
          <Button asChild className="h-11 rounded-full px-5 font-bold">
            <a href={APPSTORE_URL}>Get the app</a>
          </Button>
        </nav>
      </div>
    </header>
  );
}

export default Header;
