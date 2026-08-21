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
} from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSocketStore } from "../store/socketStore";

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

          {/* Connection Status Dropdown Trigger */}
          <TouchableOpacity
            onPress={() => setMenuModalVisible(true)}
            activeOpacity={0.8}
            className={`px-3 py-1.5 rounded-full flex-row items-center gap-1.5 border ${
              isPaired
                ? "bg-emerald-500/10 border-emerald-500/30"
                : isConnected
                  ? "bg-amber-500/10 border-amber-500/30"
                  : "bg-white/5 border-white/10"
            }`}
          >
            <View
              className={`w-2 h-2 rounded-full ${
                isPaired
                  ? "bg-emerald-400"
                  : isConnected
                    ? "bg-amber-400"
                    : "bg-white/30"
              }`}
            />
            <Text
              className={`text-[11px] font-bold ${
                isPaired
                  ? "text-emerald-400"
                  : isConnected
                    ? "text-amber-400"
                    : "text-white/40"
              }`}
            >
              {isPaired ? "Paired" : isConnected ? "Connecting" : "Offline"}
            </Text>
            <CaretDown size={11} color="rgba(255,255,255,0.4)" weight="bold" />
          </TouchableOpacity>
        </View>

        {/* Connection Menu Modal */}
        <Modal
          visible={menuModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setMenuModalVisible(false)}
            className="flex-1 bg-black/80 justify-center items-center p-6"
          >
            <View
              onStartShouldSetResponder={() => true}
              className="w-full bg-[#1e1e24] border border-white/15 rounded-2xl p-5 shadow-2xl space-y-4"
            >
              <View className="flex-row items-center justify-between border-b border-white/10 pb-3">
                <View>
                  <Text className="text-white font-bold text-base">Workstation Connection</Text>
                  <Text className="text-white/50 text-xs mt-0.5">
                    {serverIp ? `Target IP: ${serverIp}` : "No workstation active"}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setMenuModalVisible(false)}>
                  <X size={18} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>

              {/* 1-Tap Reconnect Option (if previously connected) */}
              {!isPaired && lastHost ? (
                <TouchableOpacity
                  onPress={handleQuickReconnect}
                  className="py-3 px-4 rounded-xl bg-purple-600/20 border border-purple-500/50 flex-row items-center justify-between"
                >
                  <View className="flex-row items-center gap-3">
                    <Lightning size={20} color="#C084FC" weight="fill" />
                    <View>
                      <Text className="text-purple-300 font-bold text-sm">
                        Reconnect to {lastHost}
                      </Text>
                      <Text className="text-white/40 text-[10px]">
                        Saved Code: {lastCode || "******"}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-purple-400 font-extrabold text-xs">RECONNECT</Text>
                </TouchableOpacity>
              ) : null}

              {/* Connect / Scan New QR */}
              <TouchableOpacity
                onPress={() => {
                  setMenuModalVisible(false);
                  router.push("/connect");
                }}
                className="py-3 px-4 rounded-xl bg-white/5 border border-white/10 flex-row items-center gap-3"
              >
                <QrCode size={20} color="#38BDF8" weight="bold" />
                <Text className="text-white font-semibold text-sm">
                  {isPaired ? "Scan New Station QR" : "Scan QR / Manual Connect"}
                </Text>
              </TouchableOpacity>

              {/* Rename Device */}
              <TouchableOpacity
                onPress={handleOpenRename}
                className="py-3 px-4 rounded-xl bg-white/5 border border-white/10 flex-row items-center gap-3"
              >
                <PencilSimple size={20} color="#A78BFA" weight="bold" />
                <Text className="text-white font-semibold text-sm">Change Device Name</Text>
              </TouchableOpacity>

              {/* Disconnect Option */}
              {isPaired && (
                <TouchableOpacity
                  onPress={() => {
                    disconnect();
                    setMenuModalVisible(false);
                  }}
                  className="py-3 px-4 rounded-xl bg-red-500/10 border border-red-500/30 flex-row items-center gap-3"
                >
                  <XCircle size={20} color="#F87171" weight="bold" />
                  <Text className="text-red-400 font-semibold text-sm">Disconnect Station</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
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
    </SafeAreaView>
  );
}
