import { Link } from "expo-router";
import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ExerciseImage from "~/components/exercises/exercise-image";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { useExercisesQuery } from "~/hooks/queries/exercises";
import { Exercise } from "~/lib/models";

export default function LibraryScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const {
    data: exercises,
    refetch: refetchExercises,
    hasNextPage,
    fetchNextPage,
  } = useExercisesQuery({
    variables: {},
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchExercises();
    setRefreshing(false);
  }, [refetchExercises]);

  return (
    <SafeAreaView
      edges={["top"]}
      style={{
        paddingBottom: 64,
      }}
      className="flex-1"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        className="p-6"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={{ paddingBottom: 64 }}>
          <VStack className="items-stretch flex-1">
            <H3>Library</H3>
            <VStack>
              <MenuList className="w-full">
                {exercises?.pages?.map((page) =>
                  page.data.map((exercise: Exercise) => (
                    <React.Fragment key={exercise.id}>
                      <Link href={`/exercises/${exercise.id}`} asChild>
                        <MenuListItem icon="chevron-right" className="flex-1">
                          <HStack className="flex-1">
                            <ExerciseImage exercise={exercise} />
                            <Text className="flex-1">{exercise.name}</Text>
                          </HStack>
                        </MenuListItem>
                      </Link>
                      <Separator />
                    </React.Fragment>
                  )),
                )}
              </MenuList>
            </VStack>
            {hasNextPage && (
              <Button variant="secondary" onPress={() => fetchNextPage()}>
                <Text>Load more...</Text>
              </Button>
            )}
          </VStack>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
