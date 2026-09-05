import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { AuthProvider } from "./src/context/AuthContext";
import { ThemeProvider } from "./src/context/ThemeContext";
import RootNavigator from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <StatusBar style="dark" />
        <AuthProvider>
          <ThemeProvider>
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
          </ThemeProvider>
        </AuthProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
