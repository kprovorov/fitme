import Image from "next/image";

import { cn } from "@/lib/utils";

interface PhoneProps {
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  src: string;
}

/** An iPhone-shaped frame around a raw simulator screenshot (1320 × 2868). */
function Phone({
  alt,
  className,
  priority,
  sizes = "(min-width: 1024px) 320px, 70vw",
  src,
}: PhoneProps) {
  return (
    <div
      className={cn(
        "relative aspect-[1320/2868] rounded-[13%/6%] bg-black p-[3.2%] ring-1 ring-white/15",
        className
      )}
    >
      <Image
        alt={alt}
        className="h-full w-full rounded-[10.5%/4.9%] object-cover object-top"
        height={2868}
        priority={priority}
        sizes={sizes}
        src={src}
        width={1320}
      />
    </div>
  );
}

export { Phone };
