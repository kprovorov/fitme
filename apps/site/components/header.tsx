import Image from "next/image";
import Link from "next/link";

import { appStoreUrl, navLinks } from "@/lib/site";
import { MobileMenu } from "./mobile-menu";
import { Button } from "./ui/button";
import { Container } from "./ui/container";

function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link className="shrink-0" href="/">
          <Image alt="Fitme" height={30} priority src="/logo.svg" width={100} />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-2 md:gap-6">
          <ul className="hidden items-center gap-6 md:flex">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  href={link.href}
                >
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
          <Button asChild size="sm">
            <a href={appStoreUrl}>Download</a>
          </Button>
          <MobileMenu />
        </nav>
      </Container>
    </header>
  );
}

export default Header;
