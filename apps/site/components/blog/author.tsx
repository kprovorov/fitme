"use client";

import Image from "next/image";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";

export default function Author() {
  return (
    <HStack className="justify-start gap-2">
      <Image
        alt={"Kirill Provorov"}
        className="rounded-full"
        height={50}
        src={"https://github.com/kprovorov.png"}
        width={50}
      />

      <VStack className="items-start gap-0">
        <span className="text-body-emphasized">Kirill Provorov</span>
        <a className="text-subhead" href={"https://x.com/kprovorov"}>
          @kprovorov
        </a>
      </VStack>
    </HStack>
  );
}
