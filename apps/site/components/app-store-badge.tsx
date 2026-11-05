import Image from "next/image";

import { appStoreUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

function AppStoreBadge({ className }: { className?: string }) {
  return (
    <a
      className={cn(
        "focus-visible:ring-ring focus-visible:ring-offset-background inline-flex shrink-0 rounded-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
        className
      )}
      href={appStoreUrl}
    >
      <Image
        alt="Download on the App Store"
        height={45}
        src="/appstore.svg"
        width={151}
      />
    </a>
  );
}

export { AppStoreBadge };
