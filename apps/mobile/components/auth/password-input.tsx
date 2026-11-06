import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { SymbolImage } from "~/components/symbol-image";
import { Input } from "~/components/ui/input";
import type { InputProps } from "~/components/ui/input";

export const PasswordInput = ({ className, ...props }: InputProps) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const toggleVisibility = useCallback(() => setVisible((value) => !value), []);

  return (
    <View className="gap-xs flex-row items-start">
      <Input
        {...props}
        autoCapitalize="none"
        autoCorrect={false}
        className={className}
        containerClassName="flex-1"
        secureTextEntry={!visible}
      />
      <Pressable
        accessibilityLabel={t(
          visible ? "auth.password.hide" : "auth.password.show"
        )}
        accessibilityRole="button"
        accessibilityState={{ disabled: props.editable === false }}
        className="min-h-12 w-12 items-center justify-center"
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
};
