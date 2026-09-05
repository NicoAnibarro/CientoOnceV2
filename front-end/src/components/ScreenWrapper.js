import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import colors, { registerThemeListener } from "../theme/colors";
export default function ScreenWrapper({ children, style }) {
  return (
    <SafeAreaView
      edges={["top", "bottom", "left", "right"]}
      style={[s.root, style]}
    >
      <KeyboardAvoidingView
        style={s.root}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const createStyles = () =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
  });
let s = createStyles();
registerThemeListener(() => {
  s = createStyles();
});
