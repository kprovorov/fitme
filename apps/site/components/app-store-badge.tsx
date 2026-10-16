import Image from "next/image";

import { appStoreUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

function AppStoreBadge({ className }: { className?: string }) {
  return (
    <a
      className={cn(
        "inline-flex shrink-0 rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
