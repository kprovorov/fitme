import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

interface AuthenticatedProps {
  children: React.ReactNode;
}

export default function Authenticated({ children }: AuthenticatedProps) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator colorClassName="accent-foreground" size="large" />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/auth/register" />;
  }

  return children;
}
