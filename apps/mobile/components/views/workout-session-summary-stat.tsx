import type { SFSymbol } from "sf-symbols-typescript";
import { SymbolImage } from "~/components/symbol-image";
import { HStack } from "~/components/ui/hstack";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";

interface WorkoutSessionSummaryStatProps {
  icon: SFSymbol;
  title: string;
  value: string;
}

export default function WorkoutSessionSummaryStat({
  icon,
  title,
  value,
}: WorkoutSessionSummaryStatProps) {
  return (
    <VStack className="items-start gap-1">
      <HStack className="gap-1">
        <SymbolImage
          className="text-footnote text-muted-foreground"
          name={icon}
        />
        <Text className="text-footnote text-muted-foreground">{title}</Text>
      </HStack>
      <Text className="text-foreground text-title-1-emphasized">{value}</Text>
    </VStack>
  );
}
