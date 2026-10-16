import Image from "next/image";

import { APPSTORE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

function AppStoreBadge({ className }: { className?: string }) {
  return (
    <a
      className={cn(
        "inline-block rounded-lg focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4",
        className
      )}
      href={APPSTORE_URL}
    >
      <Image
        alt="Download on the App Store"
        height={54}
        src="/appstore.svg"
        width={181}
      />
    </a>
  );
}

export { AppStoreBadge };
