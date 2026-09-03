import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  StatusBar,
  Modal,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Clock,
  Book,
  Monitor,
  SquaresFour,
  Microphone,
  Broadcast,
  Link,
  FileArrowUp,
  PencilSimple,
  CaretDown,
  Lightning,
  QrCode,
  XCircle,
  X,
  User,
  SignIn,
  SignOut,
  LockSimple,
  Sparkle,
} from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSocketStore } from "../store/socketStore";
import { useAuthStore } from "../store/authStore";
import GuestExpiredGate from "../components/GuestExpiredGate";

export default function Dashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const {
    isConnected,
    isPaired,
    isAdmin,
    deviceName,
    setDeviceName,
    serverIp,
    lastHost,
    lastCode,
    reconnectLastSession,
    disconnect,
  } = useSocketStore();
  const { user, isAuthenticated, guestRemainingMinutes, logout } = useAuthStore();

  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [menuModalVisible, setMenuModalVisible] = useState(false);
  const [tempName, setTempName] = useState(deviceName);

  const handleOpenRename = () => {
    setTempName(deviceName);
    setMenuModalVisible(false);
    setRenameModalVisible(true);
  };

  const handleSaveRename = () => {
    if (tempName.trim()) {
      setDeviceName(tempName.trim());
    }
    setRenameModalVisible(false);
  };

  const handleQuickReconnect = () => {
    setMenuModalVisible(false);
    reconnectLastSession();
  };

  const cards = [
    {
      id: "connect",
      label: "Connect",
      icon: Link,
      gradient: ["#FF416C", "#FF4B2B"],
      description: "Host Setup",
    },
    {
      id: "assets",
      label: "Media Share",
      icon: FileArrowUp,
      gradient: ["#F2994A", "#F2C94C"],
      description: "Send Assets",
    },
    {
      id: "timer",
      label: "Timer",
      icon: Clock,
      gradient: ["#11998e", "#38ef7d"],
      description: "Sync & Events",
    },
    {
      id: "scenes",
      label: "Scene",
      icon: SquaresFour,
      gradient: ["#FF512F", "#DD2476"],
      description: "Create & Share",
    },
    {
      id: "bible",
      label: "Bible",
      icon: Book,
      gradient: ["#2980B9", "#6DD5FA"],
      description: "Scripture",
    },
    {
      id: "presentation",
      label: "Teleprompter",
      icon: Monitor,
      gradient: ["#8E2DE2", "#4A00E0"],
      description: "Slides & Content",
    },
    {
      id: "stage-control",
      label: "Stage Master",
      icon: Broadcast,
      gradient: isAdmin ? ["#8A2387", "#E94057", "#F27121"] : ["#2a2838", "#1c1b26"],
      description: isAdmin ? "Admin Live Control" : "Admin Locked",
      adminOnly: true,
    },
    {
      id: "intercom",
      label: "Intercom",
      icon: Microphone,
      gradient: ["#f12711", "#f5af19"],
      description: "Push-to-Talk",
    },
  ];

  // Chunk cards into pairs of 2 for clean flex-1 row distribution
  const cardPairs = [];
  for (let i = 0; i < cards.length; i += 2) {
    cardPairs.push(cards.slice(i, i + 2));
  }

  return (
    <SafeAreaView className="flex-1 bg-[#121212]">
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6 mt-2">
          <View>
            <Text className="text-3xl font-black text-white tracking-tight">
              OCS<Text className="text-green-400">.</Text>
            </Text>
            <TouchableOpacity
              onPress={handleOpenRename}
              className="flex-row items-center gap-1.5 mt-0.5"
            >
              <Text className="text-white/60 text-xs font-semibold">
                {deviceName || "Mobile Companion"}
              </Text>
              {isAdmin && (
                <View className="bg-purple-500/25 border border-purple-500/50 px-1.5 py-0.5 rounded-md">
                  <Text className="text-purple-300 text-[9px] font-black uppercase tracking-wider">
                    Admin
                  </Text>
                </View>
              )}
              <PencilSimple size={12} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          </View>

          {/* Top Right: Auth Status & Connection Trigger */}
          <View className="flex-row items-center gap-2">
            {/* Account / Guest Pill */}
            {isAuthenticated ? (
              <TouchableOpacity
                onPress={() => setMenuModalVisible(true)}
                activeOpacity={0.8}
                className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-500/20 border border-purple-500/40"
              >
                <User size={12} color="#C084FC" weight="bold" />
                <Text className="text-[11px] font-bold text-purple-200 truncate max-w-[100px]">
                  {user?.name || user?.churchName || "Account"}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => router.push("/login" as any)}
                activeOpacity={0.8}
                className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/40"
              >
                <LockSimple size={12} color="#FBBF24" weight="bold" />
                <Text className="text-[11px] font-bold text-amber-300">
                  Guest: {guestRemainingMinutes}m
                </Text>
              </TouchableOpacity>
            )}

            {/* Connection Status Dropdown Trigger */}
            <TouchableOpacity
              onPress={() => setMenuModalVisible(true)}
              activeOpacity={0.8}
              className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                isPaired
                  ? "bg-emerald-500/20 border-emerald-400/40"
                  : "bg-white/10 border-white/20"
              }`}
            >
              <View
                className={`w-2 h-2 rounded-full ${
                  isPaired
                    ? "bg-emerald-400"
                    : "bg-white/40"
                }`}
              />
              <Text
                className={`text-[11px] font-extrabold tracking-wide ${
                  isPaired
                    ? "text-emerald-300"
                    : "text-white/70"
                }`}
              >
                {isPaired ? "Paired" : "Offline"}
              </Text>
              <CaretDown
                size={11}
                color={isPaired ? "#6EE7B7" : "rgba(255,255,255,0.7)"}
                weight="bold"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Connection Menu Modal — Full Page */}
        <Modal
          visible={menuModalVisible}
          animationType="slide"
          presentationStyle="fullScreen"
          statusBarTranslucent
          transparent={false}
          onRequestClose={() => setMenuModalVisible(false)}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: "#121212" }}>
            <View style={{ flex: 1, padding: 20, justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                {/* Header */}
                <View className="border-b border-white/10 pb-4 mb-6">
                  <Text className="text-white font-black text-2xl">Workstation Connection</Text>
                  <Text className="text-white/60 text-xs mt-1 font-medium">
                    {isPaired ? "Connected to Host" : "Offline"}
                  </Text>
                </View>

                {/* Options List */}
                <View style={{ gap: 14 }}>
                  {/* When DISCONNECTED: Show 1-Tap Reconnect Option (if previously connected) */}
                  {!isPaired && lastHost ? (
                    <TouchableOpacity
                      onPress={handleQuickReconnect}
                      className="py-4 px-4 rounded-2xl bg-purple-600/20 border border-purple-500/50 flex-row items-center justify-between"
                    >
                      <View className="flex-row items-center gap-3">
                        <Lightning size={22} color="#C084FC" weight="fill" />
                        <View>
                          <Text className="text-purple-300 font-bold text-sm">
                            Reconnect to {lastHost}
                          </Text>
                          <Text className="text-white/40 text-[11px] mt-0.5">
                            Saved Code: {lastCode || "******"}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-purple-400 font-extrabold text-xs">RECONNECT</Text>
                    </TouchableOpacity>
                  ) : null}

                  {/* When DISCONNECTED: Show Scan QR / Manual Connect */}
                  {!isPaired && (
                    <TouchableOpacity
                      onPress={() => {
                        setMenuModalVisible(false);
                        router.push("/connect");
                      }}
                      className="py-4 px-4 rounded-2xl bg-white/5 border border-white/10 flex-row items-center gap-3"
                    >
                      <QrCode size={22} color="#38BDF8" weight="bold" />
                      <View>
                        <Text className="text-white font-bold text-sm">
                          Scan QR / Manual Connect
                        </Text>
                        <Text className="text-white/40 text-[11px] mt-0.5">
                          Pair with a new desktop workstation
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Change Device Name (Available both connected and disconnected) */}
                  <TouchableOpacity
                    onPress={handleOpenRename}
                    className="py-4 px-4 rounded-2xl bg-white/5 border border-white/10 flex-row items-center gap-3"
                  >
                    <PencilSimple size={22} color="#A78BFA" weight="bold" />
                    <View>
                      <Text className="text-white font-bold text-sm">Change Device Name</Text>
                      <Text className="text-white/40 text-[11px] mt-0.5">
                        Current: {deviceName || "Mobile Companion"}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Account Section */}
                  <View className="pt-2 border-t border-white/10">
                    <Text className="text-white/40 text-[10px] font-black uppercase tracking-wider mb-2">
                      OCS Account & License
                    </Text>

                    {isAuthenticated ? (
                      <View className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex-row items-center justify-between">
                        <View className="flex-row items-center gap-3">
                          <View className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-500/40 items-center justify-center">
                            <User size={20} color="#C084FC" weight="bold" />
                          </View>
                          <View>
                            <Text className="text-white font-bold text-sm">
                              {user?.name || user?.churchName || "Authenticated"}
                            </Text>
                            <Text className="text-white/40 text-[11px]">
                              {user?.email || "Signed In"}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => {
                            logout();
                            setMenuModalVisible(false);
                          }}
                          className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 flex-row items-center gap-1.5"
                        >
                          <SignOut size={14} color="#F87171" weight="bold" />
                          <Text className="text-red-400 font-bold text-xs">Sign Out</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => {
                          setMenuModalVisible(false);
                          router.push("/login" as any);
                        }}
                        className="p-4 rounded-2xl bg-gradient-to-r from-violet-600/20 to-pink-600/20 border border-purple-500/40 flex-row items-center justify-between"
                      >
                        <View className="flex-row items-center gap-3">
                          <View className="w-10 h-10 rounded-xl bg-purple-600/30 items-center justify-center">
                            <SignIn size={20} color="#C084FC" weight="bold" />
                          </View>
                          <View>
                            <Text className="text-white font-bold text-sm">Sign In to OCS Account</Text>
                            <Text className="text-amber-300/80 text-[11px]">
                              Guest Mode: {guestRemainingMinutes}m left
                            </Text>
                          </View>
                        </View>
                        <Text className="text-purple-400 font-extrabold text-xs">LOG IN</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* When CONNECTED: Show Disconnect Option */}
                  {isPaired && (
                    <TouchableOpacity
                      onPress={() => {
                        disconnect();
                        setMenuModalVisible(false);
                      }}
                      className="py-4 px-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex-row items-center gap-3"
                    >
                      <XCircle size={22} color="#F87171" weight="bold" />
                      <View>
                        <Text className="text-red-400 font-bold text-sm">Disconnect Workstation</Text>
                        <Text className="text-red-400/60 text-[11px] mt-0.5">
                          End current remote controller session
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Close Bottom Button */}
              <TouchableOpacity
                onPress={() => setMenuModalVisible(false)}
                className="w-full py-4 rounded-2xl bg-white/10 items-center justify-center mb-2"
              >
                <Text className="text-white font-bold text-base">Close</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>

        {/* Rename Modal */}
        <Modal
          visible={renameModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRenameModalVisible(false)}
        >
          <View className="flex-1 bg-black/80 justify-center items-center p-6">
            <View className="w-full bg-[#1e1e24] border border-white/15 rounded-2xl p-6 shadow-2xl">
              <Text className="text-white font-bold text-lg mb-1">
                Device Name
              </Text>
              <Text className="text-white/50 text-xs mb-4">
                This name appears on the desktop Controller device list.
              </Text>
              <TextInput
                value={tempName}
                onChangeText={setTempName}
                placeholder="e.g. Pastor's Phone"
                placeholderTextColor="#666"
                className="bg-black/50 border border-white/20 text-white rounded-xl p-3.5 text-base font-semibold mb-6"
                autoFocus
              />
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => setRenameModalVisible(false)}
                  className="flex-1 py-3 bg-white/10 rounded-xl items-center"
                >
                  <Text className="text-white/70 font-bold text-sm">
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveRename}
                  className="flex-1 py-3 bg-purple-600 rounded-xl items-center"
                >
                  <Text className="text-white font-bold text-sm">
                    Save Name
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* 2-Column Grid of Cards (gradient bg, no borders, gap: 8, rounded: 10, flex: 1, space-y-4) */}
        <View style={{ gap: 8 }}>
          {cardPairs.map((pair, rowIndex) => (
            <View key={rowIndex} style={{ flexDirection: "row", gap: 8 }}>
              {pair.map((card) => {
                const Icon = card.icon;

                return (
                  <TouchableOpacity
                    key={card.id}
                    onPress={() => router.push(`/${card.id}` as any)}
                    style={{ flex: 1 }}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={card.gradient as [string, string, ...string[]]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{
                        borderRadius: 10,
                        padding: 14,
                        height: 145,
                        justifyContent: "space-between",
                        overflow: "hidden",
                      }}
                      className="space-y-4"
                    >
                      {/* Top Row: Icon */}
                      <View className="flex-row justify-between items-start">
                        <View
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 8,
                            backgroundColor: "rgba(255, 255, 255, 0.2)",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Icon color="#ffffff" size={20} weight="fill" />
                        </View>
                      </View>

                      {/* Bottom Row: Label & Description with space-y-1 */}
                      <View className="space-y-1">
                        <Text className="text-lg font-black text-white leading-tight tracking-tight">
                          {card.label}
                        </Text>
                        <Text className="text-white/80 text-[11px] font-semibold tracking-wide">
                          {card.description}
                        </Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
      <GuestExpiredGate />
    </SafeAreaView>
  );
}
