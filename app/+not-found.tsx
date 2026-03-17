import { Link, Stack } from "expo-router";
import { H1 } from "~/components/ui/typography";
import { Button } from "~/components/ui/button";
import { VStack } from "~/components/ui/vstack";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <VStack>
        <H1>This screen doesn&apos;t exist.</H1>
        <Link href="/" asChild>
          <Button>Go to home screen!</Button>
        </Link>
      </VStack>
    </>
  );
}
