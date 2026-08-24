import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import "../global.css";
import IncomingIntercomPlayer from "../components/IncomingIntercomPlayer";
import MobileSplash from "../components/MobileSplash";
import GuestExpiredGate from "../components/GuestExpiredGate";
import { useAuthStore } from "../store/authStore";

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: "index",
};

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
    <>
      <MobileSplash minDurationMs={1200} />
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
        <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
