import { Link, Stack } from "expo-router";
import { Button } from "~/components/ui/button";
import { H1 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <VStack>
        <H1>This screen doesn't exist.</H1>
        <Link asChild href="/">
          <Button>Go to home screen!</Button>
        </Link>
      </VStack>
    </>
  );
}
