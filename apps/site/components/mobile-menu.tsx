"use client";

import { IconMenu2, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { navLinks } from "@/lib/site";

/**
 * The header's links below `md`, in a dropdown that closes when one is picked,
 * on Escape (focus goes back to the toggle) or when the route changes.
 */
const MobileMenu = () => {
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The path the menu was opened on: navigating anywhere else closes it.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const isOpen = openPath === pathname;
  const MenuIcon = isOpen ? IconX : IconMenu2;

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
      <button
        aria-controls="mobile-menu"
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close menu" : "Open menu"}
        className="focus-visible:ring-ring focus-visible:ring-offset-background text-body-emphasized text-foreground hover:bg-muted inline-flex size-(--size-button-circle-lg) shrink-0 items-center justify-center gap-2 rounded-full bg-transparent p-0 whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
        onClick={toggle}
        ref={triggerRef}
        type="button"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none inline-flex size-5 shrink-0 items-center justify-center [&_svg]:size-full"
        >
          <MenuIcon />
        </span>
      </button>
      {isOpen ? (
        <ul
          className="bg-background absolute inset-x-0 top-full flex flex-col border-b px-5 py-2"
          id="mobile-menu"
        >
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                className="text-foreground block py-3"
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
};

export { MobileMenu };
