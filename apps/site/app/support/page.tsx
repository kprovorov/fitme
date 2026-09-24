import { Mail } from "lucide-react";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";

export const metadata: Metadata = {
  openGraph: {
    url: "https://fitmeproject.com/support",
  },
};

function SupportPage() {
  return (
    <VStack>
      <h1>Fitme Support</h1>
      <Button asChild variant="link">
        <a href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL}`}>
          <HStack>
            <Mail />
            {process.env.NEXT_PUBLIC_SUPPORT_EMAIL}
          </HStack>
        </a>
      </Button>
    </VStack>
  );
}

export default SupportPage;
