import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useCurrentUserQuery } from "~/hooks/queries/auth";

interface AuthenticatedProps {
  children: React.ReactNode;
}

export default function Authenticated({ children }: AuthenticatedProps) {
  const { data: user, isLoading, isFetched } = useCurrentUserQuery();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  if (!user && isFetched) {
    return <Redirect href="/auth/register" />;
  }

  return children;
}
