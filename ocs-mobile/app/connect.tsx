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
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardAvoid}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.card}>
              <View style={styles.monitorIconBox}>
                <Monitor size={40} color="#60A5FA" weight="duotone" />
              </View>

              <Text style={styles.title}>Pair Remote</Text>
              <Text style={styles.subtitle}>
                Scan the QR code on your desktop screen or enter the IP and 6-digit code.
              </Text>

              {/* Scan QR Code Button */}
              <TouchableOpacity
                onPress={openScanner}
                activeOpacity={0.8}
                style={styles.scanButton}
              >
                <QrCode size={22} color="#60A5FA" weight="bold" />
                <Text style={styles.scanButtonText}>Scan QR / Barcode</Text>
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or manual</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* IP Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Desktop IP Address</Text>
                <TextInput
                  style={styles.textInput}
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
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>6-Digit Pairing Code</Text>
                <TextInput
                  style={[styles.textInput, styles.pairingInput]}
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
                <View style={styles.errorBox}>
                  <XCircle size={16} color="#F87171" weight="bold" />
                  <Text style={styles.errorText}>{connectionError}</Text>
                </View>
              )}

              {/* Action Button */}
              {ready ? (
                <TouchableOpacity
                  onPress={disconnect}
                  activeOpacity={0.8}
                  style={styles.disconnectButton}
                >
                  <XCircle size={20} color="#F87171" weight="bold" />
                  <Text style={styles.disconnectText}>Disconnect</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleManualConnect}
                  activeOpacity={0.8}
                  style={styles.connectButton}
                >
                  <Text style={styles.connectText}>
                    {isConnected && !isPaired ? "Pairing…" : "Connect & Pair"}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Paired Status Badge */}
              {ready && (
                <View style={styles.pairedBadge}>
                  <CheckCircle size={16} color="#4ADE80" weight="fill" />
                  <Text style={styles.pairedText}>Paired with {serverIp}</Text>
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
        <SafeAreaView style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity
              onPress={() => setIsScannerOpen(false)}
              style={styles.scannerCloseButton}
            >
              <X size={20} color="white" weight="bold" />
            </TouchableOpacity>
            <Text style={styles.scannerHeaderTitle}>Scan Desktop QR Code</Text>
            <TouchableOpacity
              onPress={() => setTorch(!torch)}
              style={[styles.scannerCloseButton, torch ? styles.torchActive : null]}
            >
              <Lightning
                size={20}
                color={torch ? "black" : "white"}
                weight={torch ? "fill" : "bold"}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.scannerBody}>
            <CameraView
              style={StyleSheet.absoluteFill}
              enableTorch={torch}
              barcodeScannerSettings={{
                barcodeTypes: ["qr", "ean13", "code128", "code39"],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />

            {/* Scanner Viewfinder Overlay */}
            <View style={styles.viewFinder}>
              <View style={styles.viewFinderInner} />
              <View style={styles.laserLine} />
            </View>

            <View style={styles.scannerTipBox}>
              <Text style={styles.scannerTipText}>
                Point camera at the QR code in OCS Desktop → Remote
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  card: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
  },
  monitorIconBox: {
    marginBottom: 16,
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
  title: {
    color: "white",
    fontWeight: "bold",
    fontSize: 20,
    marginBottom: 4,
  },
  subtitle: {
    color: "rgba(255, 255, 255, 0.5)",
    textAlign: "center",
    fontSize: 12,
    marginBottom: 20,
    lineHeight: 18,
  },
  scanButton: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 16,
  },
  scanButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
  },
  dividerRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  dividerText: {
    color: "rgba(255, 255, 255, 0.3)",
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "bold",
    letterSpacing: 1.5,
  },
  inputGroup: {
    width: "100%",
    marginBottom: 14,
  },
  inputLabel: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "bold",
    letterSpacing: 1,
    marginBottom: 6,
    marginLeft: 4,
  },
  textInput: {
    width: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    color: "white",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    textAlign: "center",
    fontSize: 16,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  pairingInput: {
    fontSize: 20,
    letterSpacing: 6,
  },
  errorBox: {
    marginBottom: 16,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorText: {
    color: "#F87171",
    fontSize: 12,
    flex: 1,
    fontWeight: "500",
  },
  connectButton: {
    width: "100%",
    backgroundColor: "#2563EB",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  connectText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  disconnectButton: {
    width: "100%",
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  disconnectText: {
    color: "#F87171",
    fontWeight: "bold",
  },
  pairedBadge: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  pairedText: {
    color: "#4ADE80",
    fontSize: 12,
    fontWeight: "bold",
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: "black",
  },
  scannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    zIndex: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  scannerCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  torchActive: {
    backgroundColor: "#EAB308",
  },
  scannerHeaderTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  scannerBody: {
    flex: 1,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  viewFinder: {
    width: 256,
    height: 256,
    borderWidth: 2,
    borderColor: "rgba(34, 211, 238, 0.8)",
    borderRadius: 24,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  viewFinderInner: {
    width: 240,
    height: 240,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 16,
  },
  laserLine: {
    position: "absolute",
    top: "50%",
    left: 16,
    right: 16,
    height: 2,
    backgroundColor: "#22D3EE",
  },
  scannerTipBox: {
    position: "absolute",
    bottom: 40,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 9999,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  scannerTipText: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
});
