import React, { useState, useRef } from "react";
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
  Pressable,
  Keyboard,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useSocketStore } from "../store/socketStore";
import { DESIGN_TOKENS } from "../constants/theme";
import AppLogo from "../components/AppLogo";
import {
  ArrowLeft,
  Monitor,
  DeviceMobile,
  CheckCircle,
  XCircle,
  QrCode,
  X,
  Lightning,
  Link,
  LinkBreak,
  Camera,
  Laptop,
  WifiHigh,
  Clock,
  Lock,
  CaretRight,
  Lightbulb,
} from "phosphor-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

export default function ConnectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    connect,
    isConnected,
    isPaired,
    serverIp,
    lastHost,
    lastCode,
    reconnectLastSession,
    disconnect,
    connectionError,
    deviceName,
    isAdmin,
    deviceRole,
  } = useSocketStore();

  const [ip, setIp] = useState(serverIp || "");
  const [pairingCode, setPairingCode] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torch, setTorch] = useState(false);

  // Track when we first became connected
  const connectedAtRef = useRef<Date | null>(null);

  const ready = isConnected && isPaired;
  const isConnecting = isConnected && !isPaired;

  if (ready && !connectedAtRef.current) {
    connectedAtRef.current = new Date();
  }
  if (!ready) {
    connectedAtRef.current = null;
  }

  const getConnectedAtLabel = () => {
    if (!connectedAtRef.current) return null;
    const t = connectedAtRef.current;
    const timeStr = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `Today, ${timeStr}`;
  };

  // Auto-parse if user pastes a full ocs://pair URI, query string, or JSON into the IP field
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
        "Invalid QR Code",
        `Scanned code does not match desktop pairing format:\n\n${data}`,
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
    if (!ip.trim()) {
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

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardAvoid}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        <Pressable onPress={Keyboard.dismiss} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 24) + 16 },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Top Navigation Row */}
            <View style={styles.topNavRow}>
              <TouchableOpacity
                onPress={handleBack}
                activeOpacity={0.75}
                style={styles.backButton}
                accessibilityRole="button"
                accessibilityLabel="Go back to dashboard"
              >
                <ArrowLeft size={18} color="#FFFFFF" weight="bold" />
              </TouchableOpacity>

              <View style={styles.topLogoContainer}>
                <AppLogo variant="icon" height={40} width={40} accessibilityLabel="OCS" />
              </View>

              {/* Spacer to keep logo centered */}
              <View style={styles.topNavSpacer} />
            </View>

            {ready ? (
              /* ─── CONNECTED SUCCESS STATE ────────────────────────────────── */
              <View style={styles.successContainer}>
                <Text style={styles.successTitle}>Connected!</Text>
                <Text style={styles.successSubtitle}>
                  Your device is now paired with
                </Text>
                <Text style={styles.successHostName}>
                  {lastHost || serverIp || "Desktop Workstation"}
                </Text>

                {/* Large double-ring circular checkmark */}
                <View style={styles.successCircleOuter}>
                  <View style={styles.successCircleInner}>
                    <CheckCircle size={56} color="#22C55E" weight="fill" />
                  </View>
                </View>

                {/* Session detail rows */}
                <View style={styles.sessionCard}>
                  <View style={styles.sessionRow}>
                    <View style={styles.sessionRowLeft}>
                      <Monitor size={15} color="rgba(255,255,255,0.45)" weight="regular" />
                      <Text style={styles.sessionLabel}>Device Name</Text>
                    </View>
                    <Text style={styles.sessionValue}>
                      {lastHost || serverIp || "Workstation"}
                    </Text>
                  </View>

                  <View style={styles.sessionDivider} />

                  <View style={styles.sessionRow}>
                    <View style={styles.sessionRowLeft}>
                      <WifiHigh size={15} color="rgba(255,255,255,0.45)" weight="regular" />
                      <Text style={styles.sessionLabel}>IP Address</Text>
                    </View>
                    <Text style={styles.sessionValue}>
                      {serverIp || lastHost || "–"}
                    </Text>
                  </View>

                  {getConnectedAtLabel() && (
                    <>
                      <View style={styles.sessionDivider} />
                      <View style={styles.sessionRow}>
                        <View style={styles.sessionRowLeft}>
                          <Clock size={15} color="rgba(255,255,255,0.45)" weight="regular" />
                          <Text style={styles.sessionLabel}>Connected At</Text>
                        </View>
                        <Text style={styles.sessionValue}>
                          {getConnectedAtLabel()}
                        </Text>
                      </View>
                    </>
                  )}

                  <View style={styles.sessionDivider} />

                  <View style={styles.sessionRow}>
                    <View style={styles.sessionRowLeft}>
                      <View style={styles.statusDotIcon} />
                      <Text style={styles.sessionLabel}>Status</Text>
                    </View>
                    <Text style={styles.sessionValueGreen}>Paired and Ready</Text>
                  </View>
                </View>

                {/* Go to Dashboard */}
                <TouchableOpacity
                  onPress={() => router.replace("/")}
                  activeOpacity={0.85}
                  style={styles.primaryButton}
                  accessibilityRole="button"
                  accessibilityLabel="Go to Dashboard"
                >
                  <Text style={styles.primaryButtonText}>Go to Dashboard</Text>
                </TouchableOpacity>

                {/* Disconnect */}
                <TouchableOpacity
                  onPress={disconnect}
                  activeOpacity={0.8}
                  style={styles.disconnectButton}
                  accessibilityRole="button"
                  accessibilityLabel="Disconnect from desktop workstation"
                >
                  <LinkBreak size={16} color="#F87171" weight="bold" />
                  <Text style={styles.disconnectText}>Disconnect</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* ─── PAIRING FORM STATE ─────────────────────────────────────── */
              <View style={styles.formContainer}>
                {/* Intro */}
                <View style={styles.introHeader}>
                  <Text style={styles.introTitle}>Connect to Desktop</Text>
                  <Text style={styles.introSubtitle}>
                    Pair this device with your desktop to control your service, manage media, and more.
                  </Text>
                </View>

                {/* Illustration: Laptop ←→ Phone */}
                <View style={styles.illustrationContainer}>
                  <View style={styles.illustrationRow}>
                    <View style={styles.illustrationDevice}>
                      <Laptop size={22} color="#6272FF" weight="fill" />
                    </View>

                    <View style={styles.illustrationConnector}>
                      <View style={styles.illustrationDash} />
                      <View style={styles.illustrationDash} />
                      <View style={styles.illustrationLinkBadge}>
                        <Link size={12} color="#A78BFA" weight="bold" />
                      </View>
                      <View style={styles.illustrationDash} />
                      <View style={styles.illustrationDash} />
                    </View>

                    <View style={styles.illustrationDevice}>
                      <DeviceMobile size={22} color="#A78BFA" weight="fill" />
                    </View>
                  </View>
                  <Text style={styles.illustrationTagline}>One Church. Connected.</Text>
                </View>

                {/* QR Pairing Card */}
                <View style={styles.qrCard}>
                  <View style={styles.qrCardHeaderRow}>
                    <View style={styles.qrIconBox}>
                      <QrCode size={20} color="#6272FF" weight="bold" />
                    </View>
                    <View style={styles.qrCardHeaderText}>
                      <Text style={styles.qrCardTitle}>Scan QR Code</Text>
                      <Text style={styles.qrCardSubtitle}>
                        Scan the QR code shown on your desktop screen
                      </Text>
                    </View>
                    <CaretRight size={18} color="rgba(255,255,255,0.3)" weight="bold" />
                  </View>

                  <TouchableOpacity
                    onPress={openScanner}
                    activeOpacity={0.85}
                    style={styles.qrScanButton}
                    accessibilityRole="button"
                    accessibilityLabel="Open camera to scan desktop QR code"
                  >
                    <Camera size={18} color="#FFFFFF" weight="bold" />
                    <Text style={styles.qrScanButtonText}>Open Camera to Scan</Text>
                  </TouchableOpacity>
                </View>

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or enter manually</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* 1-Tap Reconnect */}
                {lastHost ? (
                  <TouchableOpacity
                    onPress={() => reconnectLastSession()}
                    activeOpacity={0.8}
                    style={styles.reconnectButton}
                    accessibilityRole="button"
                    accessibilityLabel={`1-Tap Reconnect to ${lastHost}`}
                  >
                    <Lightning size={16} color="#C084FC" weight="fill" />
                    <Text style={styles.reconnectButtonText}>
                      1-Tap Reconnect to {lastHost}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {/* Field 1: Desktop IP Address */}
                <View style={styles.inputGroup}>
                  <View style={styles.inputLabelRow}>
                    <Monitor size={15} color="rgba(255,255,255,0.7)" weight="bold" />
                    <Text style={styles.inputLabel}>Desktop IP Address</Text>
                  </View>
                  <Text style={styles.inputHelperText}>
                    Enter the IP address shown on your desktop
                  </Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. 192.168.1.10"
                      placeholderTextColor="rgba(255, 255, 255, 0.3)"
                      value={ip}
                      onChangeText={handleIpChange}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="default"
                      returnKeyType="next"
                      accessibilityLabel="Desktop IP address input"
                    />
                    <View style={styles.inputEndIcon} pointerEvents="none">
                      <Monitor size={14} color="rgba(255,255,255,0.2)" weight="regular" />
                    </View>
                  </View>
                </View>

                {/* Field 2: 6-Digit Pairing Code */}
                <View style={styles.inputGroup}>
                  <View style={styles.inputLabelRow}>
                    <Lock size={15} color="rgba(255,255,255,0.7)" weight="bold" />
                    <Text style={styles.inputLabel}>6-Digit Pairing Code</Text>
                  </View>
                  <Text style={styles.inputHelperText}>
                    Enter the code shown on your desktop
                  </Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={[styles.textInput, styles.pairingCodeInput]}
                      placeholder="0  0  0  0  0  0"
                      placeholderTextColor="rgba(255, 255, 255, 0.3)"
                      value={pairingCode}
                      onChangeText={setPairingCode}
                      keyboardType="number-pad"
                      maxLength={6}
                      accessibilityLabel="6-digit pairing code input"
                    />
                    <View style={styles.inputEndIcon} pointerEvents="none">
                      <Lock size={14} color="rgba(255,255,255,0.2)" weight="regular" />
                    </View>
                  </View>
                </View>

                {/* Error Banner */}
                {connectionError ? (
                  <View style={styles.errorBox}>
                    <XCircle size={16} color="#F87171" weight="bold" />
                    <Text style={styles.errorText}>{connectionError}</Text>
                  </View>
                ) : null}

                {/* Connect & Pair CTA */}
                <TouchableOpacity
                  onPress={handleManualConnect}
                  disabled={isConnecting}
                  activeOpacity={0.85}
                  style={[
                    styles.primaryButton,
                    isConnecting && styles.primaryButtonDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Connect and pair with desktop workstation"
                >
                  {isConnecting ? (
                    <>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.primaryButtonText}>Connecting…</Text>
                    </>
                  ) : (
                    <>
                      <Link size={18} color="#FFFFFF" weight="bold" />
                      <Text style={styles.primaryButtonText}>Connect &amp; Pair</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Network Tip */}
                <View style={styles.networkTipRow}>
                  <Lightbulb size={14} color="rgba(255, 255, 255, 0.4)" weight="regular" />
                  <Text style={styles.networkTipText}>
                    Tip: Make sure your desktop and phone are on the same Wi-Fi network.
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
        </Pressable>
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
              accessibilityRole="button"
              accessibilityLabel="Close QR Scanner"
            >
              <X size={20} color="#FFFFFF" weight="bold" />
            </TouchableOpacity>

            <Text style={styles.scannerHeaderTitle}>Scan Desktop QR Code</Text>

            <TouchableOpacity
              onPress={() => setTorch(!torch)}
              style={[styles.scannerCloseButton, torch ? styles.torchActive : null]}
              accessibilityRole="button"
              accessibilityLabel="Toggle Camera Light"
            >
              <Lightning
                size={20}
                color={torch ? "#000000" : "#FFFFFF"}
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

            {/* Viewfinder Overlay */}
            <View style={styles.viewFinder}>
              <View style={styles.viewFinderCornerTL} />
              <View style={styles.viewFinderCornerTR} />
              <View style={styles.viewFinderCornerBL} />
              <View style={styles.viewFinderCornerBR} />
              <View style={styles.laserLine} />
            </View>

            <View style={styles.scannerTipBox}>
              <Text style={styles.scannerTipText}>
                Point camera at the QR code shown on your desktop screen
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Primary accent color (blue/purple matching reference) ──────────────────
const PRIMARY = "#5B5EFF";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0F1A",
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  // ── Top Navigation ──────────────────────────────────────────────────────────
  topNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: DESIGN_TOKENS.borderRadius,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  topLogoContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  topNavSpacer: {
    width: 36,
  },

  // ── Form Container ──────────────────────────────────────────────────────────
  formContainer: {
    gap: 16,
  },

  // ── Intro Header ────────────────────────────────────────────────────────────
  introHeader: {
    alignItems: "center",
    gap: 6,
  },
  introTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  introSubtitle: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.5)",
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 280,
  },

  // ── Connection Illustration ─────────────────────────────────────────────────
  illustrationContainer: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.025)",
    borderRadius: DESIGN_TOKENS.borderRadius,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.07)",
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 10,
  },
  illustrationRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    justifyContent: "center",
  },
  illustrationDevice: {
    width: 56,
    height: 56,
    borderRadius: DESIGN_TOKENS.borderRadius,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  illustrationConnector: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
  },
  illustrationDash: {
    flex: 1,
    height: 1.5,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 1,
  },
  illustrationLinkBadge: {
    width: 26,
    height: 26,
    borderRadius: DESIGN_TOKENS.borderRadius,
    backgroundColor: "rgba(167, 139, 250, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  illustrationTagline: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.35)",
    letterSpacing: 0.4,
    textAlign: "center",
  },

  // ── QR Pairing Card ─────────────────────────────────────────────────────────
  qrCard: {
    backgroundColor: "#13172A",
    borderRadius: DESIGN_TOKENS.borderRadius,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: 16,
    gap: 14,
  },
  qrCardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  qrIconBox: {
    width: 40,
    height: 40,
    borderRadius: DESIGN_TOKENS.borderRadius,
    backgroundColor: "rgba(91, 94, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(91, 94, 255, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  qrCardHeaderText: {
    flex: 1,
    gap: 2,
  },
  qrCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  qrCardSubtitle: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.45)",
    lineHeight: 16,
  },
  qrScanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY,
    borderRadius: DESIGN_TOKENS.borderRadius,
    paddingVertical: 14,
    gap: 8,
  },
  qrScanButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },

  // ── Divider ─────────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
  },
  dividerText: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.3)",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },

  // ── Quick Reconnect ─────────────────────────────────────────────────────────
  reconnectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(139, 92, 246, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.3)",
    borderRadius: DESIGN_TOKENS.borderRadius,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  reconnectButtonText: {
    color: "#C084FC",
    fontSize: 13,
    fontWeight: "700",
  },

  // ── Input Fields ────────────────────────────────────────────────────────────
  inputGroup: {
    gap: 4,
  },
  inputLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.85)",
  },
  inputHelperText: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.4)",
    marginBottom: 4,
    lineHeight: 15,
  },
  inputWrapper: {
    position: "relative",
    justifyContent: "center",
  },
  textInput: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: DESIGN_TOKENS.borderRadius,
    paddingHorizontal: 14,
    paddingVertical: 13,
    paddingRight: 42,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
  },
  pairingCodeInput: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 6,
    textAlign: "center",
  },
  inputEndIcon: {
    position: "absolute",
    right: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Error Banner ────────────────────────────────────────────────────────────
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
    borderRadius: DESIGN_TOKENS.borderRadius,
    padding: 12,
    gap: 10,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    lineHeight: 17,
  },

  // ── Primary Button ──────────────────────────────────────────────────────────
  primaryButton: {
    backgroundColor: PRIMARY,
    borderRadius: DESIGN_TOKENS.borderRadius,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    width: "100%",
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  // ── Network Tip ─────────────────────────────────────────────────────────────
  networkTipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  networkTipText: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.4)",
    flex: 1,
    lineHeight: 16,
  },

  // ── SUCCESS STATE ───────────────────────────────────────────────────────────
  successContainer: {
    alignItems: "center",
    gap: 10,
    paddingTop: 4,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.55)",
    textAlign: "center",
  },
  successHostName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 4,
  },
  // Double-ring circular checkmark
  successCircleOuter: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderWidth: 2,
    borderColor: "rgba(34, 197, 94, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 6,
  },
  successCircleInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(34, 197, 94, 0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(34, 197, 94, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Session detail card
  sessionCard: {
    width: "100%",
    backgroundColor: "#13172A",
    borderRadius: DESIGN_TOKENS.borderRadius,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
  },
  sessionRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sessionLabel: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 13,
    fontWeight: "500",
  },
  sessionValue: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
    maxWidth: 170,
  },
  sessionValueGreen: {
    color: "#22C55E",
    fontSize: 13,
    fontWeight: "700",
  },
  sessionDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  statusDotIcon: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#22C55E",
  },
  // Disconnect button (transparent outline)
  disconnectButton: {
    width: "100%",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.3)",
    paddingVertical: 14,
    borderRadius: DESIGN_TOKENS.borderRadius,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 2,
  },
  disconnectText: {
    color: "#F87171",
    fontSize: 14,
    fontWeight: "700",
  },

  // ── QR Scanner Modal ────────────────────────────────────────────────────────
  scannerContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    zIndex: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(13, 15, 26, 0.9)",
  },
  scannerCloseButton: {
    width: 38,
    height: 38,
    borderRadius: DESIGN_TOKENS.borderRadius,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  torchActive: {
    backgroundColor: "#EAB308",
  },
  scannerHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  scannerBody: {
    flex: 1,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  viewFinder: {
    width: 250,
    height: 250,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  viewFinderCornerTL: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 30,
    height: 30,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: PRIMARY,
    borderTopLeftRadius: DESIGN_TOKENS.borderRadius,
  },
  viewFinderCornerTR: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 30,
    height: 30,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: PRIMARY,
    borderTopRightRadius: DESIGN_TOKENS.borderRadius,
  },
  viewFinderCornerBL: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 30,
    height: 30,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: PRIMARY,
    borderBottomLeftRadius: DESIGN_TOKENS.borderRadius,
  },
  viewFinderCornerBR: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: PRIMARY,
    borderBottomRightRadius: DESIGN_TOKENS.borderRadius,
  },
  laserLine: {
    position: "absolute",
    top: "50%",
    left: 12,
    right: 12,
    height: 2,
    backgroundColor: PRIMARY,
    opacity: 0.8,
  },
  scannerTipBox: {
    position: "absolute",
    bottom: 40,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: DESIGN_TOKENS.borderRadius,
    backgroundColor: "rgba(13, 15, 26, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  scannerTipText: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
});
