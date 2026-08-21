import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import "../global.css";
import IncomingIntercomPlayer from "../components/IncomingIntercomPlayer";
import MobileSplash from "../components/MobileSplash";

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: "index",
};

export default function RootLayout() {
  return (
    <>
      <MobileSplash minDurationMs={1200} />
      <IncomingIntercomPlayer isBanner={true} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
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
