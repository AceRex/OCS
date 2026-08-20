import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useSocketStore } from "../store/socketStore";
import {
  ArrowLeft,
  Monitor,
  CheckCircle,
  XCircle,
  QrCode,
  X,
  Lightning,
} from "phosphor-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

export default function ConnectScreen() {
  const router = useRouter();
  const {
    connect,
    isConnected,
    isPaired,
    serverIp,
    disconnect,
    connectionError,
  } = useSocketStore();
  const [ip, setIp] = useState(serverIp || "");
  const [pairingCode, setPairingCode] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torch, setTorch] = useState(false);

  // Auto-parse if user pastes a full ocs://pair URI or JSON into the IP field
  const handleIpChange = (text: string) => {
    const trimmed = text.trim();
    if (
      trimmed.startsWith("ocs://pair") ||
      trimmed.includes("?ip=") ||
      trimmed.startsWith("{")
    ) {
      parseAndConnect(trimmed);
    } else {
      setIp(text);
    }
  };

  const parseAndConnect = (data: string): boolean => {
    try {
      const raw = data.trim();

      // Format 1: ocs://pair?ip=192.168.1.10&port=4000&token=123456&code=123456
      if (raw.startsWith("ocs://pair") || raw.includes("?ip=")) {
        const queryIndex = raw.indexOf("?");
        const queryString =
          queryIndex !== -1 ? raw.substring(queryIndex + 1) : raw;
        const params = new URLSearchParams(queryString);
        const parsedIp = params.get("ip") || "";
        const parsedPort = parseInt(params.get("port") || "4000", 10);
        const parsedCode = params.get("code") || params.get("token") || "";

        if (parsedIp && parsedCode) {
          setIp(parsedIp);
          setPairingCode(parsedCode);
          setIsScannerOpen(false);
          connect(parsedIp, parsedCode, parsedPort);
          return true;
        }
      }

      // Format 2: JSON payload {"ip":"192.168.1.10","port":4000,"code":"123456","token":"..."}
      if (raw.startsWith("{") && raw.endsWith("}")) {
        const parsed = JSON.parse(raw);
        if (parsed.ip && (parsed.code || parsed.token)) {
          const parsedIp = String(parsed.ip);
          const parsedCode = String(parsed.code || parsed.token);
          const parsedPort = parsed.port ? parseInt(parsed.port, 10) : 4000;
          setIp(parsedIp);
          setPairingCode(parsedCode);
          setIsScannerOpen(false);
          connect(parsedIp, parsedCode, parsedPort);
          return true;
        }
      }

      // Format 3: Simple IP:CODE (e.g. 192.168.1.5:123456)
      if (raw.includes(":") && !raw.startsWith("http")) {
        const parts = raw.split(":");
        if (
          parts.length === 2 &&
          parts[1].length === 6 &&
          !isNaN(Number(parts[1]))
        ) {
          setIp(parts[0]);
          setPairingCode(parts[1]);
          setIsScannerOpen(false);
          connect(parts[0], parts[1]);
          return true;
        }
      }
    } catch (err) {
      console.warn("[Connect] Parse error:", err);
    }
    return false;
  };

  const handleBarcodeScanned = ({ data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);

    const success = parseAndConnect(data);
    if (success) {
      setIsScannerOpen(false);
      setTimeout(() => setScanned(false), 1000);
    } else {
      Alert.alert(
        "Invalid QR / Barcode",
        `Scanned code does not match OCS desktop format:\n\n${data}`,
        [{ text: "OK", onPress: () => setScanned(false) }],
      );
    }
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert(
          "Camera Permission Required",
          "Please allow camera access to scan the desktop pairing QR code.",
        );
        return;
      }
    }
    setScanned(false);
    setIsScannerOpen(true);
  };

  const handleManualConnect = () => {
    if (!ip) {
      Alert.alert("Error", "Please enter an IP Address or scan the QR code");
      return;
    }
    if (!pairingCode.trim()) {
      Alert.alert(
        "Error",
        "Enter the 6-digit pairing code from the desktop Remote panel",
      );
      return;
    }
    connect(ip.trim(), pairingCode.trim());
  };

  const ready = isConnected && isPaired;

  return (
    <SafeAreaView className="flex-1 bg-[#121212]">
      {/* Header */}
      {/* <View className="flex-row items-center justify-between p-4 border-b border-white/10">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <ArrowLeft size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-bold">
          Connect to Desktop
        </Text>
        <View className="w-6" />
      </View> */}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingHorizontal: 24,
              paddingVertical: 20,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View className="w-full bg-white/5 p-6 rounded-3xl border border-white/10 items-center shadow-2xl">
              <View className="mb-4 bg-blue-500/20 p-5 rounded-2xl border border-blue-500/30">
                <Monitor size={40} color="#60A5FA" weight="duotone" />
              </View>

              <Text className="text-white font-bold text-xl mb-1">
                Pair Remote
              </Text>
              <Text className="text-white/50 text-center text-xs mb-5 leading-relaxed">
                Scan the QR code on your desktop screen or enter the IP and
                6-digit code.
              </Text>

              {/* Scan QR Code Button */}
              <TouchableOpacity
                onPress={openScanner}
                activeOpacity={0.8}
                className="w-full bg-white/10 hover:bg-white/15 border border-white/20 p-4 rounded-2xl flex-row items-center justify-center gap-3 mb-4 shadow-md"
              >
                <QrCode size={22} color="#60A5FA" weight="bold" />
                <Text className="text-white font-bold text-sm">
                  Scan QR / Barcode
                </Text>
              </TouchableOpacity>

              <View className="w-full flex-row items-center gap-3 my-2">
                <View className="flex-1 h-[1px] bg-white/10" />
                <Text className="text-white/30 text-[10px] uppercase font-bold tracking-widest">
                  or manual
                </Text>
                <View className="flex-1 h-[1px] bg-white/10" />
              </View>

              {/* IP Input */}
              <View className="w-full mb-3">
                <Text className="text-white/50 text-[10px] uppercase font-bold tracking-wider mb-1.5 ml-1">
                  Desktop IP Address
                </Text>
                <TextInput
                  className="w-full bg-black/60 border border-white/15 text-white px-4 py-3.5 rounded-xl text-center text-base font-mono"
                  placeholder="192.168.1.X"
                  placeholderTextColor="#555"
                  value={ip}
                  onChangeText={handleIpChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                />
              </View>

              {/* Pairing Code Input */}
              <View className="w-full mb-4">
                <Text className="text-white/50 text-[10px] uppercase font-bold tracking-wider mb-1.5 ml-1">
                  6-Digit Pairing Code
                </Text>
                <TextInput
                  className="w-full bg-black/60 border border-white/15 text-white px-4 py-3 rounded-xl text-center text-xl font-mono tracking-[0.25em]"
                  placeholder="000000"
                  placeholderTextColor="#555"
                  value={pairingCode}
                  onChangeText={setPairingCode}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>

              {/* Connection Error Banner */}
              {connectionError && (
                <View className="mb-4 bg-red-500/10 p-3 rounded-xl border border-red-500/20 w-full flex-row items-center gap-2">
                  <XCircle size={16} color="#F87171" weight="bold" />
                  <Text className="text-red-400 text-xs flex-1 font-medium">
                    {connectionError}
                  </Text>
                </View>
              )}

              {/* Action Button */}
              {ready ? (
                <TouchableOpacity
                  onPress={disconnect}
                  activeOpacity={0.8}
                  className="w-full bg-red-500/20 border border-red-500/40 p-4 rounded-2xl items-center flex-row justify-center gap-2"
                >
                  <XCircle size={20} color="#F87171" weight="bold" />
                  <Text className="text-red-400 font-bold">Disconnect</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleManualConnect}
                  activeOpacity={0.8}
                  className="w-full bg-blue-600 active:bg-blue-700 p-4 rounded-2xl items-center shadow-lg shadow-blue-600/30"
                >
                  <Text className="text-white font-bold text-base">
                    {isConnected && !isPaired ? "Pairing…" : "Connect & Pair"}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Paired Status Badge */}
              {ready && (
                <View className="mt-4 flex-row items-center gap-2 bg-green-500/15 px-4 py-2 rounded-full border border-green-500/30">
                  <CheckCircle size={16} color="#4ADE80" weight="fill" />
                  <Text className="text-green-400 text-xs font-bold">
                    Paired with {serverIp}
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* QR / Barcode Scanner Modal */}
      <Modal
        visible={isScannerOpen}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setIsScannerOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-black">
          <View className="flex-row items-center justify-between p-4 z-20 border-b border-white/10 bg-black/60 backdrop-blur-md">
            <TouchableOpacity
              onPress={() => setIsScannerOpen(false)}
              className="w-10 h-10 rounded-full bg-white/10 items-center justify-center"
            >
              <X size={20} color="white" weight="bold" />
            </TouchableOpacity>
            <Text className="text-white text-base font-bold">
              Scan Desktop QR Code
            </Text>
            <TouchableOpacity
              onPress={() => setTorch(!torch)}
              className={`w-10 h-10 rounded-full items-center justify-center ${torch ? "bg-yellow-500" : "bg-white/10"}`}
            >
              <Lightning
                size={20}
                color={torch ? "black" : "white"}
                weight={torch ? "fill" : "bold"}
              />
            </TouchableOpacity>
          </View>

          <View className="flex-1 relative justify-center items-center overflow-hidden">
            <CameraView
              style={StyleSheet.absoluteFill}
              enableTorch={torch}
              barcodeScannerSettings={{
                barcodeTypes: ["qr", "ean13", "code128", "code39"],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />

            {/* Scanner Viewfinder Overlay */}
            <View className="w-64 h-64 border-2 border-cyan-400/80 rounded-3xl relative justify-center items-center shadow-2xl bg-black/10">
              <View className="w-60 h-60 border border-white/20 rounded-2xl" />
              <View className="absolute top-1/2 left-4 right-4 h-0.5 bg-cyan-400 shadow-md shadow-cyan-400" />
            </View>

            <View className="absolute bottom-10 px-6 py-3 rounded-full bg-black/80 border border-white/20">
              <Text className="text-white/80 text-xs font-medium text-center">
                Point camera at the QR code in OCS Desktop → Remote
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
