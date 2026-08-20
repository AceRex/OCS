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
  MusicNotes,
  Microphone,
  Camera,
  Broadcast,
  Gear,
  House,
  CaretRight,
  Link,
  FileArrowUp,
  PencilSimple,
  Check,
  X,
} from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSocketStore } from "../store/socketStore";

export default function Dashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { isConnected, isPaired, deviceName, setDeviceName } = useSocketStore();

  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [tempName, setTempName] = useState(deviceName);

  // Fixed 2 columns unless very small screen
  const numColumns = width < 380 ? 1 : 2;

  const handleOpenRename = () => {
    setTempName(deviceName);
    setRenameModalVisible(true);
  };

  const handleSaveRename = () => {
    if (tempName.trim()) {
      setDeviceName(tempName.trim());
    }
    setRenameModalVisible(false);
  };

  const cards = [
    {
      id: "connect",
      label: "Connect",
      icon: Link,
      gradient: ["#FF416C", "#FF4B2B"], // Red/Pink Gradient
      iconColor: "#ffffff",
      description: "Host Setup",
    },
    {
      id: "assets",
      label: "Media Share",
      icon: FileArrowUp,
      gradient: ["#F2994A", "#F2C94C"], // Amber/Orange Gradient
      iconColor: "#ffffff",
      description: "Send Assets",
    },
    {
      id: "timer",
      label: "Timer",
      icon: Clock,
      gradient: ["#11998e", "#38ef7d"], // Green Gradient
      iconColor: "#ffffff",
      description: "Sync & Events",
    },
    {
      id: "bible",
      label: "Bible",
      icon: Book,
      gradient: ["#2980B9", "#6DD5FA"], // Blue Gradient
      iconColor: "#ffffff",
      description: "Scripture",
    },
    {
      id: "presentation",
      label: "Media",
      icon: Monitor,
      gradient: ["#8E2DE2", "#4A00E0"], // Purple Gradient
      iconColor: "#ffffff",
      description: "Slides & Content",
    },
    {
      id: "intercom",
      label: "Intercom",
      icon: Microphone,
      gradient: ["#f12711", "#f5af19"], // Orange/Red Gradient
      iconColor: "#ffffff",
      description: "Push-to-Talk",
    },
  ];

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
              <PencilSimple size={12} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          </View>
          <View className="flex-row items-center gap-2">
            <View
              className={`px-3 py-1.5 rounded-full flex-row items-center gap-1.5 border ${
                isPaired
                  ? "bg-green-500/10 border-green-500/30"
                  : isConnected
                    ? "bg-amber-500/10 border-amber-500/30"
                    : "bg-white/5 border-white/10"
              }`}
            >
              <View
                className={`w-2 h-2 rounded-full ${
                  isPaired
                    ? "bg-green-400"
                    : isConnected
                      ? "bg-amber-400"
                      : "bg-white/30"
                }`}
              />
              <Text
                className={`text-[11px] font-bold ${
                  isPaired
                    ? "text-green-400"
                    : isConnected
                      ? "text-amber-400"
                      : "text-white/40"
                }`}
              >
                {isPaired ? "Paired" : isConnected ? "Connecting" : "Offline"}
              </Text>
            </View>
          </View>
        </View>

        {/* Rename Modal */}
        <Modal
          visible={renameModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRenameModalVisible(false)}
        >
          <View className="flex-1 bg-black/80 justify-center items-center p-6">
            <View className="w-full bg-[#1e1e24] border border-white/15 rounded-3xl p-6 shadow-2xl">
              <Text className="text-white font-bold text-lg mb-1">
                Device Name
              </Text>
              <Text className="text-white/50 text-xs mb-4">
                This name will appear on the desktop Controller device list.
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
                  className="flex-1 py-3 bg-blue-600 rounded-xl items-center"
                >
                  <Text className="text-white font-bold text-sm">
                    Save Name
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Grid */}
        <View className="flex-row flex-wrap justify-between">
          {cards.map((card) => {
            const Icon = card.icon;
            const cardWidth = (width - 40 - 15) / numColumns; // 40 padding, 15 gap

            return (
              <TouchableOpacity
                key={card.id}
                onPress={() => router.push(`/${card.id}` as any)}
                style={{
                  width: numColumns > 1 ? cardWidth : "100%",
                  marginBottom: 15,
                }}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={card.gradient as [string, string, ...string[]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  className="p-5 h-44 justify-between relative overflow-hidden shadow-lg"
                  style={{
                    shadowColor: card.gradient[0],
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.3,
                    shadowRadius: 10,
                    elevation: 10,
                    borderRadius: 12,
                    padding: 5,
                  }}
                >
                  {/* Background Accents */}
                  {/* <View className="absolute -right-6 -top-6 rounded-full w-24 h-24 bg-white/20 blur-xl" />
                  <View className="absolute -left-6 -bottom-6 rounded-full w-32 h-32 bg-black/10 blur-xl" /> */}

                  <View className="flex-row justify-between items-start z-10">
                    <View className="w-10 h-10 rounded-2xl bg-white/20 items-center justify-center backdrop-blur-sm border border-white/10">
                      <Icon color={card.iconColor} size={20} weight="fill" />
                    </View>
                    <View className="bg-black/20 rounded-full p-1 opacity-0">
                      <CaretRight color="white" size={12} weight="bold" />
                    </View>
                  </View>

                  <View className="z-10">
                    <Text className="text-xl font-bold text-white leading-tight mb-1 drop-shadow-md">
                      {card.label}
                    </Text>
                    <Text className="text-white/80 text-xs font-semibold tracking-wide bg-black/10 self-start px-2 py-1 rounded-lg overflow-hidden">
                      {card.description}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Footer info or stats could go here */}
        <View className="mt-8 items-center">
          <Text className="text-white/20 text-xs">v1.0.0 • Connected</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
