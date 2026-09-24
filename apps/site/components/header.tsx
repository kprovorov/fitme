import Image from "next/image";
import Link from "next/link";
import { Button } from "./ui/button";
import { HStack } from "./ui/hstack";

function Header() {
  const links = [
    { href: "/blog", title: "Blog" },
    { href: "/support", title: "Support" },
  ];

  return (
    <header className="p-3">
      <HStack className="justify-between">
        <Link href="/">
          <Image
            alt="Fitme logo"
            height={30}
            priority
            src="/logo.svg"
            width={100}
          />
        </Link>
        <HStack className="gap-6">
          {links.map((link) => (
            <Link
              className="underline-offset-4 hover:underline"
              href={link.href}
              key={link.href}
            >
              {link.title}
            </Link>
          ))}
          <Button asChild>
            <a href={process.env.NEXT_PUBLIC_APPSTORE_URL || ""}>Download</a>
          </Button>
        </HStack>
      </HStack>
    </header>
  );
}

export default Header;
