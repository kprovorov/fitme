import LoginForm from "@/components/forms/auth/login-form";
import { ThemedText } from "@/components/ThemedText";
import React from "react";
import { ScrollView } from "react-native";

export default function LoginScreen() {
  return (
    <ScrollView>
      <ThemedText>LoginScreen</ThemedText>
      <LoginForm />
    </ScrollView>
  );
}
