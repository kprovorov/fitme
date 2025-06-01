import { format } from "date-fns";
import React from "react";
import { useExerciseHistoryQuery } from "~/hooks/queries/exercises";
import { HStack } from "../ui/hstack";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Text } from "../ui/text";
import { H4 } from "../ui/typography";
import { VStack } from "../ui/vstack";

interface ExerciseHistoryViewProps {
  exerciseId: number;
}

export default function ExerciseHistoryView({
  exerciseId,
}: ExerciseHistoryViewProps) {
  const { data: items } = useExerciseHistoryQuery({
    variables: {
      exerciseId,
    },
  });

  return (
    <VStack className="items-stretch">
      <H4>History</H4>

      {items?.map((item) => (
        <VStack key={item.id} className="items-stretch gap-0">
          <HStack className="justify-start px-sm">
            <Text>{format(new Date(item.created_at!), "PPP")}</Text>
          </HStack>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/5">
                  <Text className="text-center">Set</Text>
                </TableHead>
                {!!item.sets[0].weight_completed && (
                  <TableHead className="w-2/5">
                    <Text className="text-center">kg</Text>
                  </TableHead>
                )}
                <TableHead className="w-2/5">
                  <Text className="text-center">Reps</Text>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {item.sets
                .sort((a, b) => a.order - b.order)
                .map((set, i) => (
                  <TableRow key={i}>
                    <TableCell className="w-1/5">
                      <Text className="text-center">#{set.order}</Text>
                    </TableCell>
                    {!!set.weight_completed && (
                      <TableCell className="w-2/5">
                        <Text className="text-center">
                          {set.weight_completed}
                        </Text>
                      </TableCell>
                    )}
                    <TableCell className="w-2/5">
                      <Text className="text-center">{set.reps_completed}</Text>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </VStack>
      ))}
    </VStack>
  );
}
