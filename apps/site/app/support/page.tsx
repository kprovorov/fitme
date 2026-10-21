import { IconMail } from "@tabler/icons-react";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
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
      <Button asChild icon={IconMail} variant="ghost">
        <a href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL}`}>
          {process.env.NEXT_PUBLIC_SUPPORT_EMAIL}
        </a>
      </Button>
    </VStack>
  );
}

export default SupportPage;
