import { SafeAreaView, ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Authenticated from "~/components/authenticated";
import { H1 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";

export default function HomeScreen() {
  return (
    <Authenticated>
      <SafeAreaProvider>
        <SafeAreaView>
          <ScrollView className="p-4">
            <VStack>
              <H1>Home</H1>
            </VStack>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Authenticated>
  );
}
