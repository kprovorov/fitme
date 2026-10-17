import Image, { type StaticImageData } from "next/image";

import { cn } from "@/lib/utils";

interface PhoneShotProps {
  alt: string;
  className?: string;
  priority?: boolean;
  /** The `sizes` hint for the rendered width; defaults to a feature-row phone. */
  sizes?: string;
  src: StaticImageData;
}

/** A framed iPhone screenshot from `public/screens` (transparent PNG, frame drawn in). */
function PhoneShot({
  alt,
  className,
  priority,
  sizes = "(min-width: 1024px) 300px, 260px",
  src,
}: PhoneShotProps) {
  return (
    <Image
      alt={alt}
      className={cn("h-auto w-full select-none", className)}
      draggable={false}
      priority={priority}
      sizes={sizes}
      src={src}
    />
  );
}

export { PhoneShot };
