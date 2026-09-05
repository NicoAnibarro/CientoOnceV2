import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native";
import colors, { registerThemeListener } from "../theme/colors";
export default function ScreenWrapper({ children, style }) {
  return (
    <SafeAreaView
      edges={["top", "bottom", "left", "right"]}
      style={[s.root, style]}
    >
      {children}
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
