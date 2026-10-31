import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { SymbolImage } from "~/components/symbol-image";
import { Input, type InputProps } from "~/components/ui/input";
export function PasswordInput({ className, ...props }: InputProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const toggleVisibility = useCallback(() => setVisible((value) => !value), []);
  return (
    <View className="relative">
      <Input
        {...props}
        autoCapitalize="none"
        autoCorrect={false}
        className={className ? `${className} pr-14` : "pr-14"}
        secureTextEntry={!visible}
      />
      <Pressable
        accessibilityLabel={t(
          visible ? "auth.password.hide" : "auth.password.show"
        )}
        accessibilityRole="button"
        accessibilityState={{ disabled: props.editable === false }}
        className="absolute top-0 right-0 min-h-12 w-12 items-center justify-center"
        disabled={props.editable === false}
        onPress={toggleVisibility}
      >
        <SymbolImage
          className="text-body text-muted-foreground"
          name={visible ? "eye" : "eye.slash"}
        />
      </Pressable>
    </View>
  );
}
