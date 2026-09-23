import { SymbolImage } from "~/components/symbol-image";
import { HStack } from "~/components/ui/hstack";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";

interface WorkoutSessionSummaryStatProps {
  icon: string;
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
        <SymbolImage name={icon} size={12} tintColor="#a1a1a1" />
        <Text className="text-footnote text-muted-foreground">{title}</Text>
      </HStack>
      <Text className="font-nunito-sans-bold text-foreground text-title-1">
        {value}
      </Text>
    </VStack>
  );
}
