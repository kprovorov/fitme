import { SafeAreaView, ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Authenticated from "~/components/authenticated";
import { Padding } from "~/components/ui/padding";
import HomeView from "~/components/views/home-view";

export default function HomeScreen() {
  return (
    <Authenticated>
      <SafeAreaProvider>
        <SafeAreaView>
          <ScrollView>
            <Padding>
              <HomeView />
            </Padding>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Authenticated>
  );
}
