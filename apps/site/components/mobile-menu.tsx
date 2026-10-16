"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { navLinks } from "@/lib/site";
import { Button } from "./ui/button";

/** The header's links below `md`, in a dropdown that closes when one is picked or on Escape. */
function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = useCallback(() => setIsOpen((open) => !open), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <div className="md:hidden">
      <Button
        aria-controls="mobile-menu"
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close menu" : "Open menu"}
        className="size-11"
        onClick={toggle}
        size="icon"
        variant="ghost"
      >
        {isOpen ? <X /> : <Menu />}
      </Button>
      {isOpen ? (
        <ul
          className="absolute inset-x-0 top-full flex flex-col border-b bg-background px-5 py-2"
          id="mobile-menu"
        >
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                className="block py-3 text-foreground"
                href={link.href}
                onClick={close}
              >
                {link.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export { MobileMenu };
