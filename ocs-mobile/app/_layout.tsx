import React, { useEffect, Component } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, Text, ScrollView, StyleSheet, LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";
import "../global.css";
import IncomingIntercomPlayer from "../components/IncomingIntercomPlayer";
import MobileSplash from "../components/MobileSplash";
import GuestExpiredGate from "../components/GuestExpiredGate";
import TeleprompterCameraPrompt from "../components/TeleprompterCameraPrompt";
import { useAuthStore } from "../store/authStore";

LogBox.ignoreLogs(["SafeAreaView has been deprecated"]);

// Suppress deprecated SafeAreaView warning from third-party library getters
const _origWarn = console.warn;
console.warn = (...args: any[]) => {
  if (typeof args[0] === "string" && args[0].includes("SafeAreaView has been deprecated")) {
    return;
  }
  _origWarn(...args);
};

// ─── Global JS Error Handler ────────────────────────────────────────────────
// Catches unhandled JS errors that would otherwise silently close the app
const _ErrorUtils = typeof globalThis !== "undefined" ? (globalThis as any).ErrorUtils : null;
if (_ErrorUtils) {
  const originalGlobalHandler = _ErrorUtils.getGlobalHandler?.();
  _ErrorUtils.setGlobalHandler?.((error: Error, isFatal: boolean) => {
    console.error("[GlobalError]", error?.message, error?.stack);
    if (isFatal) {
      // Keep the app alive to show error
      console.error("[FatalError]", error?.message);
    }
    originalGlobalHandler?.(error, isFatal);
  });
}

// ─── React Error Boundary ────────────────────────────────────────────────────
interface CrashState { hasError: boolean; error: string; stack: string }

class CrashReporter extends Component<{ children: React.ReactNode }, CrashState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "", stack: "" };
  }

  static getDerivedStateFromError(error: Error): CrashState {
    return {
      hasError: true,
      error: error?.message ?? String(error),
      stack: error?.stack ?? "",
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[CrashReporter] Caught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={crashStyles.container}>
          <View style={crashStyles.header}>
            <Text style={crashStyles.emoji}>🔴</Text>
            <Text style={crashStyles.title}>App Startup Error</Text>
            <Text style={crashStyles.subtitle}>Screenshot this screen and send to support</Text>
          </View>
          <ScrollView style={crashStyles.scrollBox} contentContainerStyle={{ padding: 16 }}>
            <Text style={crashStyles.errorLabel}>Error Message:</Text>
            <Text style={crashStyles.errorText}>{this.state.error}</Text>
            <Text style={[crashStyles.errorLabel, { marginTop: 16 }]}>Stack Trace:</Text>
            <Text style={crashStyles.stackText}>{this.state.stack}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const crashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d0a14",
    paddingTop: 60,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(239,68,68,0.3)",
  },
  emoji: { fontSize: 40, marginBottom: 8 },
  title: { color: "#ef4444", fontSize: 18, fontWeight: "900", marginBottom: 4 },
  subtitle: { color: "rgba(255,255,255,0.5)", fontSize: 11, textAlign: "center" },
  scrollBox: { flex: 1, margin: 12, backgroundColor: "rgba(255,0,0,0.05)", borderRadius: 12 },
  errorLabel: { color: "#f87171", fontSize: 11, fontWeight: "700", marginBottom: 4, letterSpacing: 0.5 },
  errorText: { color: "#fca5a5", fontSize: 12, fontWeight: "600", lineHeight: 18 },
  stackText: { color: "rgba(255,255,255,0.4)", fontSize: 9, fontFamily: "monospace", lineHeight: 14 },
});

// ─── Settings ────────────────────────────────────────────────────────────────
export const unstable_settings = {
  initialRouteName: "index",
};

// ─── Root Layout ─────────────────────────────────────────────────────────────
export default function RootLayout() {
  const { initAuth, syncGuestTimer } = useAuthStore();

  useEffect(() => {
    initAuth();
    const interval = setInterval(() => {
      syncGuestTimer();
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <SafeAreaProvider>
      <CrashReporter>
        <>
          <MobileSplash minDurationMs={1200} />
          <TeleprompterCameraPrompt />
          <IncomingIntercomPlayer isBanner={true} />
          <GuestExpiredGate />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" options={{ presentation: "modal" }} />
            <Stack.Screen name="connect" />
            <Stack.Screen name="bible" />
            <Stack.Screen name="timer" />
            <Stack.Screen name="assets" />
            <Stack.Screen name="scenes" />
            <Stack.Screen name="intercom" />
            <Stack.Screen name="stage-control" />
            <Stack.Screen name="presentation" />
            <Stack.Screen name="teleprompter" />
            <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
          </Stack>
          <StatusBar style="auto" />
        </>
      </CrashReporter>
    </SafeAreaProvider>
  );
}
