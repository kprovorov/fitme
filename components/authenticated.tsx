import { Redirect, Slot } from "expo-router";
import { View } from "react-native";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { Text } from "~/components/ui/text";

interface AuthenticatedProps {
  children: React.ReactNode;
}

export default function Authenticated({ children }: AuthenticatedProps) {
  const {
    data: user,
    isLoading,
    isFetched,
  } = useCurrentUserQuery();

  if (isLoading) {
    return (
      <View className="flex flex-col items-center justify-center gap-4 p-4 h-full">
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!user && isFetched) {
    return <Redirect href="/auth/login" />;
  }

  return children;
}
