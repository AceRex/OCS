import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Modal,
  TextInput,
  StyleSheet,
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
  VideoCamera,
  CalendarCheck,
  MagnifyingGlass,
  Bell,
  Star,
} from "phosphor-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useSocketStore } from "../store/socketStore";
import { useAuthStore } from "../store/authStore";
import { useFavoritesStore } from "../store/favoritesStore";
import { TOOL_GRADIENTS, DESIGN_TOKENS } from "../constants/theme";
import AppLogo from "../components/AppLogo";
import QuickActionCard from "../components/QuickActionCard";
import GuestExpiredGate from "../components/GuestExpiredGate";

// Dashboard navigation tabs
type DashboardTab = "home" | "favorites" | "settings";

interface ToolDefinition {
  id: string;
  title: string;
  label?: string;
  description: string;
  route: string;
  icon: any;
  gradient: [string, string] | string[];
  keywords: string[];
  badge?: string;
}

export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Socket & Device State
  const {
    isConnected,
    isPaired,
    isAdmin,
    deviceRole,
    isSwitcherController,
    deviceName,
    setDeviceName,
    lastHost,
    lastCode,
    reconnectLastSession,
    disconnect,
  } = useSocketStore();

  const isStageManager = isAdmin || deviceRole === "stageManager" || deviceRole === "admin";
  const { user, isAuthenticated, guestRemainingMinutes, logout } = useAuthStore();
  const { favorites, toggleFavorite, initFavorites } = useFavoritesStore();

  // UI States
  const [activeTab, setActiveTab] = useState<DashboardTab>("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const [tempName, setTempName] = useState(deviceName);

  // Initialize favorites on mount
  useEffect(() => {
    initFavorites();
  }, []);

  // Time-based dynamic greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  }, []);

  // User display name & initials
  const firstName = useMemo(() => {
    if (user?.name) {
      return user.name.trim().split(" ")[0];
    }
    if (user?.churchName) {
      return user.churchName.trim().split(" ")[0];
    }
    return "Operator";
  }, [user]);

  const userInitials = useMemo(() => {
    if (user?.name) {
      const parts = user.name.trim().split(" ").filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (user?.churchName) {
      return user.churchName.slice(0, 2).toUpperCase();
    }
    return "OP";
  }, [user]);

  // Current dynamic role
  const userRoleLabel = useMemo(() => {
    if (isAdmin) return "ADMIN";
    if (isStageManager) return "STAGE MASTER";
    if (user?.role) return user.role.toUpperCase();
    if (isAuthenticated) return "OPERATOR";
    return `GUEST ${guestRemainingMinutes}M`;
  }, [isAdmin, isStageManager, user, isAuthenticated, guestRemainingMinutes]);

  // 10 Canonical Quick Action Tools / Cards
  const cards = [
    {
      id: "connect",
      title: "Connect",
      description: "Host Setup &\nDevice Connection",
      route: "/connect",
      icon: Link,
      gradient: TOOL_GRADIENTS.connect,
      keywords: ["connect", "host", "pair", "connection", "setup", "wifi", "lan", "desktop", "server", "ip"],
    },
    {
      id: "assets",
      title: "Media Share",
      description: "Send Photos,\nVideos & Assets",
      route: "/assets",
      icon: FileArrowUp,
      gradient: TOOL_GRADIENTS.assets,
      keywords: ["media", "share", "assets", "photos", "videos", "send", "upload", "files", "image"],
    },
    {
      id: "agenda",
      title: "Agenda",
      description: "Plan Services &\nManage Schedule",
      route: "/agenda",
      icon: CalendarCheck,
      gradient: TOOL_GRADIENTS.agenda,
      keywords: ["agenda", "schedule", "plan", "services", "run of show", "sessions", "order of service"],
    },
    {
      id: "timer",
      title: "Timer",
      description: "Sync Timers &\nCreate Events",
      route: "/timer",
      icon: Clock,
      gradient: TOOL_GRADIENTS.timer,
      keywords: ["timer", "clock", "countdown", "sync", "events", "time", "stopwatch"],
    },
    {
      id: "scenes",
      title: "Scene",
      description: "Create Pages,\nLyrics & Backgrounds",
      route: "/scenes",
      icon: SquaresFour,
      gradient: TOOL_GRADIENTS.scenes,
      keywords: ["scene", "scenes", "pages", "lyrics", "backgrounds", "create", "slides", "display"],
    },
    {
      id: "bible",
      title: "Bible",
      description: "Access Scripture\nAnytime",
      route: "/bible",
      icon: Book,
      gradient: TOOL_GRADIENTS.bible,
      keywords: ["bible", "scripture", "verses", "passages", "translations", "word", "holy bible"],
    },
    {
      id: "presentation",
      title: "Teleprompter",
      description: "Speech & Notes\nPresentation",
      route: "/presentation",
      icon: Monitor,
      gradient: TOOL_GRADIENTS.presentation,
      keywords: ["teleprompter", "prompter", "speech", "read", "notes", "presentation", "script"],
    },
    {
      id: "stage-control",
      title: "Stage Master",
      label: "Stage Master",
      description: "Admin Live Control &\nStage Management",
      route: "/stage-control",
      icon: Broadcast,
      gradient: ["#8A2387", "#E94057", "#F27121"],
      badge: isStageManager ? undefined : "ADMIN",
      keywords: ["stage master", "stage", "stagemaster", "admin", "live control", "confidence", "shutter", "blackout", "director"],
    },
    {
      id: "intercom",
      title: "Intercom",
      description: "Push-to-Talk\nCommunication",
      route: "/intercom",
      icon: Microphone,
      gradient: TOOL_GRADIENTS.intercom,
      keywords: ["intercom", "push-to-talk", "ptt", "talk", "voice", "audio", "radio", "comm"],
    },
    {
      id: "live-switcher",
      title: "Live",
      label: "Live",
      description: isSwitcherController ? "Broadcast Studio & Mixer" : "Broadcast Studio & Camera",
      route: "/live-switcher",
      icon: VideoCamera,
      gradient: TOOL_GRADIENTS["live-switcher"],
      keywords: ["live", "camera", "broadcast", "studio", "switcher", "webrtc", "video", "mixer", "stream"],
    },
  ];

  // Helper alias for Stage Master card label: "Stage Master"
  const tools = useMemo(() => {
    return cards.map((c) => ({ ...c, label: c.title }));
  }, [cards, isStageManager, isSwitcherController]);

  // Filter tools based on active tab and search query
  const filteredTools = useMemo(() => {
    let result = tools;

    // Filter by Favorites Tab
    if (activeTab === "favorites") {
      result = result.filter((tool) => favorites.includes(tool.id));
    }

    // Filter by Search Query
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((tool) => {
        const titleMatch = tool.title.toLowerCase().includes(query);
        const descMatch = tool.description.toLowerCase().includes(query);
        const keywordMatch = tool.keywords.some((k) => k.toLowerCase().includes(query));
        return titleMatch || descMatch || keywordMatch;
      });
    }

    return result;
  }, [tools, activeTab, searchQuery, favorites]);

  // Pair cards into 2-column rows
  const cardPairs = useMemo(() => {
    const pairs: ToolDefinition[][] = [];
    for (let i = 0; i < filteredTools.length; i += 2) {
      pairs.push(filteredTools.slice(i, i + 2));
    }
    return pairs;
  }, [filteredTools]);

  // Handlers
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

  const handleQuickReconnect = () => {
    reconnectLastSession();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      {/* Main Scrollable Dashboard Content */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContainer,
          { paddingBottom: Math.max(insets.bottom, 20) + 16 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. Header Bar: Standalone App Symbol & User Profile Area */}
        <View style={styles.headerBar}>
          {/* Left: Standalone Logo Symbol (No text, no wordmark, no subtitle) */}
          <View style={styles.brandContainer}>
            <AppLogo variant="icon" height={38} width={38} accessibilityLabel="OCS" />
          </View>

          {/* Right: Notifications & Profile Trigger */}
          <View style={styles.headerRight}>
            {/* Notifications Bell */}
            <TouchableOpacity
              onPress={() => setNotificationsModalVisible(true)}
              style={styles.bellButton}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Bell size={20} color="#FFFFFF" weight="regular" />
            </TouchableOpacity>

            {/* User Profile Trigger -> Toggles Settings / Home */}
            <TouchableOpacity
              onPress={() => setActiveTab(activeTab === "settings" ? "home" : "settings")}
              style={styles.profileTrigger}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="User Account and Settings"
            >
              <LinearGradient
                colors={["#00A8FF33", "#8B5CF633"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarContainer}
              >
                <Text style={styles.avatarInitials}>{userInitials}</Text>
              </LinearGradient>
              <View style={styles.profileTextColumn}>
                <Text style={styles.profileUserName} numberOfLines={1}>
                  {user?.name || user?.churchName || "Operator"}
                </Text>
                <Text style={styles.profileUserRole} numberOfLines={1}>
                  {userRoleLabel}
                </Text>
              </View>
              <CaretDown size={12} color="rgba(255, 255, 255, 0.6)" weight="bold" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. TAB CONTENT: Either Settings OR Tools Dashboard */}
        {activeTab === "settings" ? (
          /* ─── SETTINGS VIEW ─────────────────────────────────────── */
          <View style={styles.settingsViewContainer}>
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>Companion Settings</Text>
              <Text style={styles.settingsSubtitle}>
                {isPaired
                  ? `Connected to ${lastHost || "Desktop Workstation"}`
                  : "Companion Status: Offline"}
              </Text>
            </View>

            {/* Workstation Connection Section */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Workstation Connection</Text>

              {/* Quick Reconnect if disconnected with saved host */}
              {!isPaired && lastHost ? (
                <TouchableOpacity
                  onPress={handleQuickReconnect}
                  style={styles.settingsCardHighlight}
                  activeOpacity={0.8}
                >
                  <View style={styles.settingsCardLeft}>
                    <Lightning size={22} color="#C084FC" weight="fill" />
                    <View>
                      <Text style={styles.settingsCardTitleHighlight}>
                        Reconnect to {lastHost}
                      </Text>
                      <Text style={styles.settingsCardSubtitle}>
                        Saved Pairing Code: {lastCode || "******"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.settingsBadgeText}>RECONNECT</Text>
                </TouchableOpacity>
              ) : null}

              {/* Scan QR / Pair Workstation */}
              {!isPaired && (
                <TouchableOpacity
                  onPress={() => router.push("/connect")}
                  style={styles.settingsCard}
                  activeOpacity={0.8}
                >
                  <QrCode size={22} color="#00E5FF" weight="bold" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingsCardTitle}>Scan QR / Pair Workstation</Text>
                    <Text style={styles.settingsCardSubtitle}>
                      Pair with local church desktop controller on the LAN
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Change Device Name */}
              <TouchableOpacity
                onPress={handleOpenRename}
                style={styles.settingsCard}
                activeOpacity={0.8}
              >
                <PencilSimple size={22} color="#A78BFA" weight="bold" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingsCardTitle}>Change Device Name</Text>
                  <Text style={styles.settingsCardSubtitle}>
                    Current: {deviceName || "Mobile Companion"}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Disconnect Workstation */}
              {isPaired && (
                <TouchableOpacity
                  onPress={disconnect}
                  style={styles.settingsDisconnectCard}
                  activeOpacity={0.8}
                >
                  <XCircle size={22} color="#F87171" weight="bold" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingsDisconnectTitle}>Disconnect Workstation</Text>
                    <Text style={styles.settingsDisconnectSubtitle}>
                      End current remote controller session
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* Account & License Section */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Account & License</Text>

              {isAuthenticated ? (
                <View style={styles.settingsAccountCard}>
                  <View style={styles.settingsAccountLeft}>
                    <View style={styles.settingsAccountAvatar}>
                      <User size={20} color="#00E5FF" weight="bold" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.settingsAccountName} numberOfLines={1}>
                        {user?.name || user?.churchName || "Authenticated"}
                      </Text>
                      <Text style={styles.settingsAccountEmail} numberOfLines={1}>
                        {user?.email || "Account"}
                      </Text>
                      <Text style={styles.settingsAccountRole}>
                        Role: {userRoleLabel}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={logout}
                    style={styles.settingsSignOutBtn}
                    activeOpacity={0.8}
                  >
                    <SignOut size={14} color="#F87171" weight="bold" />
                    <Text style={styles.settingsSignOutText}>Sign Out</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => router.push("/login" as any)}
                  style={styles.settingsLoginCard}
                  activeOpacity={0.8}
                >
                  <View style={styles.settingsAccountLeft}>
                    <View style={styles.settingsLoginIconBox}>
                      <SignIn size={20} color="#00E5FF" weight="bold" />
                    </View>
                    <View>
                      <Text style={styles.settingsCardTitle}>Sign In to Account</Text>
                      <Text style={styles.settingsGuestSubtitle}>
                        Guest Session: {guestRemainingMinutes}m remaining
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.settingsLoginBtnText}>LOG IN</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* System Info */}
            <View style={styles.settingsSystemCard}>
              <Text style={styles.settingsSystemText}>
                OCS Mobile Companion • v1.0.0
              </Text>
              <Text style={styles.settingsSystemSubtext}>
                Offline-First Local Network Controller • 12px Universal Design
              </Text>
            </View>

            {/* Back to Home Button */}
            <TouchableOpacity
              onPress={() => setActiveTab("home")}
              style={styles.settingsBackHomeBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.settingsBackHomeText}>Return to Dashboard</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ─── HOME / FAVORITES DASHBOARD VIEW ─────────────────────── */
          <>
            {/* Greeting Section & Real Socket Pairing Status */}
            <View style={styles.greetingSection}>
              <View style={styles.greetingLeft}>
                <Text style={styles.greetingTitle}>{greeting},</Text>
                <Text style={styles.greetingName} numberOfLines={1}>
                  {firstName} 👋
                </Text>
                <Text style={styles.greetingSubtitle}>
                  Let's create amazing experiences together
                </Text>
              </View>

              {/* Dynamic Pairing Status Badge */}
              <TouchableOpacity
                onPress={() => {
                  if (isPaired) {
                    setActiveTab("settings");
                  } else {
                    router.push("/connect");
                  }
                }}
                activeOpacity={0.8}
                style={[
                  styles.pairingBadge,
                  isPaired
                    ? styles.pairingBadgeConnected
                    : isConnected
                    ? styles.pairingBadgeConnecting
                    : styles.pairingBadgeDisconnected,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Connection status: ${isPaired ? "Paired" : isConnected ? "Connecting" : "Not Paired"}`}
              >
                <View
                  style={[
                    styles.pairingDot,
                    isPaired
                      ? styles.pairingDotConnected
                      : isConnected
                      ? styles.pairingDotConnecting
                      : styles.pairingDotDisconnected,
                  ]}
                />
                <Text
                  style={[
                    styles.pairingText,
                    isPaired
                      ? styles.pairingTextConnected
                      : isConnected
                      ? styles.pairingTextConnecting
                      : styles.pairingTextDisconnected,
                  ]}
                >
                  {isPaired ? "Paired" : isConnected ? "Connecting…" : "Not Paired"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Search Bar with Quick Favorite Toggle */}
            <View style={styles.searchContainer}>
              <View style={styles.searchInputWrapper}>
                <MagnifyingGlass
                  size={18}
                  color="rgba(255, 255, 255, 0.4)"
                  weight="bold"
                />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search tools..."
                  placeholderTextColor="rgba(255, 255, 255, 0.38)"
                  style={styles.searchInput}
                  returnKeyType="search"
                  clearButtonMode="never"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery("")}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.searchClearBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                  >
                    <X size={14} color="rgba(255, 255, 255, 0.6)" weight="bold" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Quick Favorites Filter Button */}
              <TouchableOpacity
                onPress={() => {
                  setActiveTab(activeTab === "favorites" ? "home" : "favorites");
                }}
                style={[
                  styles.searchFavoriteFilter,
                  activeTab === "favorites" && styles.searchFavoriteFilterActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Filter by favorites"
              >
                <Star
                  size={18}
                  color={activeTab === "favorites" ? "#FBBF24" : "rgba(255, 255, 255, 0.45)"}
                  weight={activeTab === "favorites" ? "fill" : "regular"}
                />
              </TouchableOpacity>
            </View>

            {/* Section Title & Tool Counter */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>
                {activeTab === "favorites" ? "Favorite Tools" : "Quick Actions"}
              </Text>
              <Text style={styles.sectionCounter}>
                {filteredTools.length} {filteredTools.length === 1 ? "Tool" : "Tools"}
              </Text>
            </View>

            {/* 2-Column Grid of Quick Action Cards */}
            {filteredTools.length > 0 ? (
              <View style={styles.gridContainer}>
                {cardPairs.map((pair, rowIndex) => (
                  <View key={`row-${rowIndex}`} style={styles.gridRow}>
                    {pair.map((tool) => (
                      <QuickActionCard
                        key={tool.id}
                        id={tool.id}
                        title={tool.title}
                        description={tool.description}
                        icon={tool.icon}
                        gradient={tool.gradient}
                        badge={tool.badge}
                        isFavorite={favorites.includes(tool.id)}
                        onToggleFavorite={() => toggleFavorite(tool.id)}
                        onPress={() => router.push(tool.route as any)}
                      />
                    ))}
                    {pair.length === 1 && <View style={styles.gridSpacer} />}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Star size={36} color="rgba(255, 255, 255, 0.2)" weight="regular" />
                <Text style={styles.emptyTitle}>
                  {activeTab === "favorites" ? "No favorite tools yet" : "No Matching Tools"}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {activeTab === "favorites"
                    ? "Tap the star on a tool to add it here."
                    : `We couldn't find any tool matching "${searchQuery}". Try searching for camera, scripture, schedule, or talk.`}
                </Text>
                {activeTab === "favorites" ? (
                  <TouchableOpacity
                    onPress={() => setActiveTab("home")}
                    style={styles.emptyActionBtn}
                  >
                    <Text style={styles.emptyActionBtnText}>Browse All Tools</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => setSearchQuery("")}
                    style={styles.emptyActionBtn}
                  >
                    <Text style={styles.emptyActionBtnText}>Clear Search</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Rename Device Modal */}
      <Modal
        visible={renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <View style={styles.renameModalOverlay}>
          <View style={styles.renameModalBox}>
            <Text style={styles.renameModalTitle}>Device Name</Text>
            <Text style={styles.renameModalSubtitle}>
              This name appears on the desktop Controller device list.
            </Text>
            <TextInput
              value={tempName}
              onChangeText={setTempName}
              placeholder="e.g. Pastor's Phone"
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              style={styles.renameModalInput}
              autoFocus
            />
            <View style={styles.renameModalActions}>
              <TouchableOpacity
                onPress={() => setRenameModalVisible(false)}
                style={styles.renameModalCancelBtn}
              >
                <Text style={styles.renameModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveRename}
                style={styles.renameModalSaveBtn}
              >
                <Text style={styles.renameModalSaveText}>Save Name</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 5. Notifications Modal */}
      <Modal
        visible={notificationsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNotificationsModalVisible(false)}
      >
        <View style={styles.renameModalOverlay}>
          <View style={styles.renameModalBox}>
            <View style={styles.notifHeaderRow}>
              <Bell size={22} color="#00E5FF" weight="fill" />
              <Text style={styles.renameModalTitle}>Notifications</Text>
            </View>
            <Text style={styles.renameModalSubtitle}>
              System alerts, companion sync messages, and stage intercom notifications will appear here.
            </Text>
            <View style={styles.notifStatusCard}>
              <Text style={styles.notifStatusTitle}>All Systems Nominal</Text>
              <Text style={styles.notifStatusText}>
                {isPaired
                  ? `Connected to desktop host ${lastHost || "Workstation"}. Zero latency telemetry active.`
                  : "Companion ready. Connect to your desktop workstation to receive live service cues."}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setNotificationsModalVisible(false)}
              style={styles.modalBottomCloseBtn}
            >
              <Text style={styles.modalBottomCloseText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Guest 1-Hour Session Expired Gate */}
      <GuestExpiredGate />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0B1020", // Canonical deep navy background
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // 1. Header Bar Styles
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    marginTop: 4,
  },
  brandContainer: {
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  profileTextColumn: {
    maxWidth: 120,
  },
  profileUserName: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  profileUserRole: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  // 2. Greeting Section
  greetingSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 12,
  },
  greetingLeft: {
    flex: 1,
  },
  greetingTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.6)",
    letterSpacing: -0.2,
  },
  greetingName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.5,
    marginVertical: 2,
  },
  greetingSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.48)",
    lineHeight: 16,
  },
  pairingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    borderWidth: 1,
    marginTop: 2,
  },
  pairingBadgeConnected: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: "rgba(16, 185, 129, 0.35)",
  },
  pairingBadgeConnecting: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderColor: "rgba(245, 158, 11, 0.35)",
  },
  pairingBadgeDisconnected: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  pairingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pairingDotConnected: {
    backgroundColor: "#34D399",
  },
  pairingDotConnecting: {
    backgroundColor: "#FBBF24",
  },
  pairingDotDisconnected: {
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  },
  pairingText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  pairingTextConnected: {
    color: "#6EE7B7",
  },
  pairingTextConnecting: {
    color: "#FCD34D",
  },
  pairingTextDisconnected: {
    color: "rgba(255, 255, 255, 0.5)",
  },

  // 3. Search Bar
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161B26",
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    paddingVertical: 0,
  },
  searchClearBtn: {
    padding: 4,
  },
  searchFavoriteFilter: {
    width: 44,
    height: 44,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "#161B26",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  searchFavoriteFilterActive: {
    backgroundColor: "rgba(251, 191, 36, 0.12)",
    borderColor: "rgba(251, 191, 36, 0.35)",
  },

  // 4. Section Title
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  sectionCounter: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.4)",
  },

  // 5. Grid Container
  gridContainer: {
    gap: 10,
  },
  gridRow: {
    flexDirection: "row",
    gap: 10,
  },
  gridSpacer: {
    flex: 1,
  },

  // Empty State
  emptyContainer: {
    padding: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    gap: 10,
    marginTop: 8,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  emptySubtitle: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyActionBtn: {
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "rgba(0, 229, 255, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.3)",
  },
  emptyActionBtnText: {
    color: "#00E5FF",
    fontSize: 12,
    fontWeight: "700",
  },

  // Settings View (Renders directly when activeTab === "settings")
  settingsViewContainer: {
    gap: 16,
    marginTop: 4,
  },
  settingsHeader: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    paddingBottom: 12,
    marginBottom: 6,
  },
  settingsTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },
  settingsSubtitle: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  settingsSection: {
    gap: 10,
  },
  settingsSectionTitle: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  settingsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "#161B26",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  settingsCardHighlight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "rgba(139, 92, 246, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.4)",
  },
  settingsCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  settingsCardTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  settingsCardTitleHighlight: {
    color: "#C084FC",
    fontSize: 14,
    fontWeight: "700",
  },
  settingsCardSubtitle: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 11,
    marginTop: 2,
  },
  settingsBadgeText: {
    color: "#C084FC",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  settingsDisconnectCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  settingsDisconnectTitle: {
    color: "#F87171",
    fontSize: 14,
    fontWeight: "700",
  },
  settingsDisconnectSubtitle: {
    color: "rgba(248, 113, 113, 0.7)",
    fontSize: 11,
    marginTop: 2,
  },
  settingsAccountCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "#161B26",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  settingsAccountLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  settingsAccountAvatar: {
    width: 40,
    height: 40,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "rgba(0, 229, 255, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsAccountName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  settingsAccountEmail: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 11,
    marginTop: 1,
  },
  settingsAccountRole: {
    color: "#00E5FF",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  settingsSignOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  settingsSignOutText: {
    color: "#F87171",
    fontSize: 11,
    fontWeight: "700",
  },
  settingsLoginCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "#161B26",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.25)",
  },
  settingsLoginIconBox: {
    width: 40,
    height: 40,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "rgba(0, 229, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsGuestSubtitle: {
    color: "#FBBF24",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  settingsLoginBtnText: {
    color: "#00E5FF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  settingsSystemCard: {
    padding: 14,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    gap: 2,
  },
  settingsSystemText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 11,
    fontWeight: "600",
  },
  settingsSystemSubtext: {
    color: "rgba(255, 255, 255, 0.35)",
    fontSize: 10,
    fontWeight: "500",
  },
  settingsBackHomeBtn: {
    paddingVertical: 14,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "rgba(0, 229, 255, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  settingsBackHomeText: {
    color: "#00E5FF",
    fontSize: 14,
    fontWeight: "700",
  },

  // 8. Rename Modal
  renameModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  renameModalBox: {
    width: "100%",
    backgroundColor: "#161B26",
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    padding: 20,
    gap: 12,
  },
  renameModalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  renameModalSubtitle: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12,
    lineHeight: 16,
  },
  renameModalInput: {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  renameModalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  renameModalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
  },
  renameModalCancelText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 13,
    fontWeight: "700",
  },
  renameModalSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "#8B5CF6",
    alignItems: "center",
  },
  renameModalSaveText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  // 9. Notifications Modal
  notifHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notifStatusCard: {
    backgroundColor: "rgba(0, 229, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.2)",
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    padding: 14,
    gap: 4,
    marginVertical: 4,
  },
  notifStatusTitle: {
    color: "#00E5FF",
    fontSize: 13,
    fontWeight: "700",
  },
  notifStatusText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 12,
    lineHeight: 16,
  },
  modalBottomCloseBtn: {
    paddingVertical: 12,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  modalBottomCloseText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
