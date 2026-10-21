"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { navLinks } from "@/lib/site";
import { Button } from "./ui/button";

/**
 * The header's links below `md`, in a dropdown that closes when one is picked,
 * on Escape (focus goes back to the toggle) or when the route changes.
 */
function MobileMenu() {
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The path the menu was opened on: navigating anywhere else closes it.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const isOpen = openPath === pathname;
  const toggle = useCallback(
    () => setOpenPath((path) => (path === pathname ? null : pathname)),
    [pathname]
  );
  const close = useCallback(() => setOpenPath(null), []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenPath(null);
        triggerRef.current?.focus();
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
        icon={isOpen ? X : Menu}
        onClick={toggle}
        ref={triggerRef}
        shape="circle"
        variant="ghost"
      />
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
