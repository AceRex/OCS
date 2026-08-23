import React, { useState } from "react";
import {
  PiClock,
  PiBook,
  PiMonitor,
  PiSquaresFour,
  PiHouse,
  PiMusicNotes,
  PiMicrophone,
  PiCamera,
  PiBroadcast,
  PiGear,
  PiDeviceMobile,
  PiSparkle,
  PiCaretLeftBold,
  PiCaretRightBold,
  PiFolder,
  PiLockKey,
  PiArrowSquareOut,
  PiSignOut,
  PiSpinner,
  PiWarning,
  PiCheckCircle,
} from "react-icons/pi";
import { useAuth } from "../context/AuthContext";

// ─── Sidebar Account / Login Component ───────────────────────────────────────


function getPlanShortBadge(tier, days) {
  const t = (tier || "trial").toLowerCase();
  let label = "Trial";
  if (t === "mini") label = "Mini";
  else if (t === "standard") label = "Standard";
  else if (t === "large") label = "Large";
  else if (t === "premium") label = "Premium";
  else if (t === "free") label = "Free";

  let daysText = days != null ? days + "d" : "60d";
  if (t === "free") daysText = "Free";
  if (t === "premium") daysText = "Unlimited";

  return { label, daysText };
}

function SidebarAccount({ isCollapsed }) {
  const {
    auth,
    isAuthenticated,
    isGracePeriod,
    waitingForBrowser,
    loading,
    error,
    login,
    logout,
    simulateLogin,
    cancelLogin,
  } = useAuth();

  const [showMenu, setShowMenu] = useState(false);

  // Loading skeleton
  if (loading) {
    return (
      <div
        className={`flex items-center p-2 rounded-2xl bg-white/5 ${
          isCollapsed ? "justify-center" : "gap-3"
        }`}
      >
        <div className="w-8 h-8 rounded-full bg-white/10 flex-shrink-0 animate-pulse" />
        {!isCollapsed && (
          <div className="flex flex-col gap-1 flex-1 overflow-hidden">
            <div className="h-2.5 bg-white/10 rounded animate-pulse w-3/4" />
            <div className="h-2 bg-white/5 rounded animate-pulse w-1/2" />
          </div>
        )}
      </div>
    );
  }

  // ── Unauthenticated / Logged Out ──────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="space-y-2">
        {error && !isCollapsed && (
          <p className="text-[10px] text-red-400 px-2 leading-tight">{error}</p>
        )}

        {waitingForBrowser ? (
          // Waiting for browser callback
          <div
            className={`flex items-center p-2.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 ${
              isCollapsed ? "justify-center" : "gap-2.5"
            }`}
          >
            <PiSpinner
              size={18}
              className="text-purple-400 animate-spin flex-shrink-0"
            />
            {!isCollapsed && (
              <div className="flex flex-col overflow-hidden flex-1">
                <span className="text-[11px] font-bold text-purple-300">
                  Waiting for browser...
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => simulateLogin()}
                    className="text-[10px] text-purple-300 hover:text-purple-200 underline font-medium"
                  >
                    Simulate
                  </button>
                  <span className="text-[10px] text-white/20">•</span>
                  <button
                    onClick={cancelLogin}
                    className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          // Log In button
          <button
            onClick={login}
            title="Log In via Browser"
            className={`flex items-center w-full p-2.5 rounded-2xl transition-all duration-200 group
              ${isCollapsed ? "justify-center" : "gap-2.5"}
            `}
            style={{
              background:
                "linear-gradient(135deg, rgba(124,58,237,0.2) 0%, rgba(168,85,247,0.12) 100%)",
              border: "1px solid rgba(168, 85, 247, 0.25)",
            }}
          >
            {/* Lock avatar */}
            <div
              className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, rgba(124,58,237,0.35) 0%, rgba(6,182,212,0.2) 100%)",
              }}
            >
              <PiLockKey size={16} className="text-purple-300" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col overflow-hidden flex-1 text-left">
                <span className="text-xs font-black text-purple-200 truncate">
                  Log In via Browser
                </span>
                <span className="text-[10px] text-white/35 truncate">
                  Activate workstation license
                </span>
              </div>
            )}
            {!isCollapsed && (
              <PiArrowSquareOut
                size={14}
                className="text-purple-400 flex-shrink-0"
              />
            )}
          </button>
        )}
      </div>
    );
  }

  // ── Authenticated (active or grace-period) ────────────────────────────────
  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu((v) => !v)}
        title={auth.orgName || auth.email || "Account"}
        className={`flex items-center w-full p-2 rounded-2xl transition-all duration-200 hover:bg-white/8 ${
          isCollapsed ? "justify-center" : "gap-3"
        }`}
      >
        {/* Avatar initials */}
        <div
          className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white select-none"
          style={{
            background: isGracePeriod
              ? "linear-gradient(135deg, #d97706 0%, #92400e 100%)"
              : "linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)",
          }}
        >
          {(auth.orgName || auth.email || "A")[0].toUpperCase()}
        </div>

        {!isCollapsed && (() => {
          const { label, daysText } = getPlanShortBadge(auth.subscriptionPlan || auth.licenseTier, auth.daysRemaining);
          return (
            <div className="flex flex-col overflow-hidden flex-1 text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white truncate">
                  {auth.orgName || "OCS Community Church"}
                </span>
                <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {label}
                </span>
              </div>
              <span className="text-[10px] text-white/40 truncate">
                {daysText} left • {auth.email || "admin@churchocs.com"}
              </span>
            </div>
          );
        })()}

        {/* State badge (collapsed: icon only, expanded: pill) */}
        {isCollapsed ? (
          isGracePeriod ? (
            <PiWarning
              size={10}
              className="text-amber-400 absolute bottom-0 right-0"
            />
          ) : (
            <PiCheckCircle
              size={10}
              className="text-emerald-400 absolute bottom-0 right-0"
            />
          )
        ) : isGracePeriod ? (
          <span className="text-[9px] font-black text-amber-300 bg-amber-500/15 border border-amber-500/20 rounded-full px-1.5 py-0.5 flex-shrink-0">
            {auth.hoursRemaining != null
              ? `${auth.hoursRemaining}h`
              : "Offline"}
          </span>
        ) : (
          <span className="text-[9px] font-black text-emerald-300 bg-emerald-500/15 border border-emerald-500/20 rounded-full px-1.5 py-0.5 flex-shrink-0 whitespace-nowrap">
            Live
          </span>
        )}
      </button>

      {/* Dropdown menu */}
      {showMenu && !isCollapsed && (
        <div
          className="absolute bottom-full mb-2 left-0 right-0 rounded-2xl border border-white/10 p-2 shadow-2xl z-[100]"
          style={{ background: "#161028" }}
        >
          {isGracePeriod && (
            <div className="px-3 py-2 mb-1 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-[10px] text-amber-300 font-semibold leading-relaxed">
                Operating offline on cached session — re-validates silently when
                connectivity resumes.
                {auth.hoursRemaining != null &&
                  ` ${auth.hoursRemaining}h remaining.`}
              </p>
            </div>
          )}
          <div className="px-3 py-2 mb-1 rounded-xl bg-white/5 space-y-1">
            <p className="text-[10px] text-white/40 truncate">{auth.email}</p>
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="text-purple-300 uppercase tracking-wider">
                {auth.subscriptionPlan || auth.licenseTier || "trial"} plan
              </span>
              <span className="text-emerald-400 font-black">
                {auth.daysRemaining != null ? `${auth.daysRemaining} days left` : (auth.subscriptionPlan === "free" ? "Free Mode" : "60 days left")}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              setShowMenu(false);
              logout();
            }}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors text-xs font-bold"
          >
            <PiSignOut size={14} />
            Log Out
          </button>
        </div>
      )}

      {/* Click-away dismiss */}
      {showMenu && (
        <div
          className="fixed inset-0 z-[99]"
          onClick={() => setShowMenu(false)}
        />
      )}
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export default function Sidebar({ activeTab, onTabChange }) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const tabs = [
    { id: "dashboard", label: "Broadcast", icon: PiHouse, isBlock: false },
    { id: "timer", label: "Timer Sync", icon: PiClock, isBlock: false },
    { id: "sessions", label: "Sessions", icon: PiFolder, isBlock: false },
    { id: "bible", label: "Bible AI", icon: PiBook, isBlock: false },
    {
      id: "presentation",
      label: "Presentation",
      icon: PiMonitor,
      isBlock: false,
    },
    { id: "songs", label: "Song Lyrics", icon: PiMusicNotes, isBlock: true },
    { id: "intercom", label: "Inapp Comm", icon: PiMicrophone, isBlock: true },
    { id: "camera", label: "Cameras", icon: PiCamera, isBlock: true },
    { id: "ndi", label: "NDI & Stream", icon: PiBroadcast, isBlock: false },
    { id: "mobile", label: "Remote", icon: PiDeviceMobile, isBlock: false },
    { id: "design", label: "Design Lab", icon: PiSparkle, isBlock: true },
    { id: "settings", label: "Settings", icon: PiGear, isBlock: false },
    { id: "apps", label: "More Apps", icon: PiSquaresFour, isBlock: true },
  ];

  return (
    <aside
      className={`${
        isCollapsed ? "w-20" : "w-60"
      } h-full bg-[#12111a]/95 backdrop-blur-2xl border border-white/10 rounded-2xl flex flex-col items-center py-5 transition-all duration-300 ease-in-out relative shadow-2xl z-50 shrink-0`}
    >
      {/* Collapse Toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-10 w-6 h-6 bg-white/10 border border-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors z-50"
      >
        {isCollapsed ? (
          <PiCaretRightBold size={12} />
        ) : (
          <PiCaretLeftBold size={12} />
        )}
      </button>

      {/* Logo */}
      <div className="w-full px-4 mb-8 flex items-center justify-center">
        <div
          className={`font-black text-2xl tracking-tighter text-white transition-opacity duration-300 ${
            isCollapsed ? "opacity-0 w-0" : "opacity-100"
          }`}
        >
          OCS
        </div>
        {isCollapsed && (
          <div className="font-black text-xl text-white/20">O</div>
        )}
      </div>

      {/* Navigation tabs */}
      <div className="flex-1 w-full overflow-y-auto no-scrollbar space-y-2 px-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isDisabled = tab.isBlock;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`${isDisabled && "hidden"}
                flex items-center w-full p-3 rounded-2xl transition-all duration-200 group relative ${
                  isActive
                    ? "bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                    : "text-white/40 hover:bg-white/5 hover:text-white/80"
                }`}
            >
              <Icon
                size={24}
                className={`shrink-0 transition-transform duration-200 ${
                  isActive ? "scale-110" : "group-hover:scale-110"
                }`}
              />

              {!isCollapsed && (
                <span className="ml-4 font-medium text-sm whitespace-nowrap opacity-100 transition-opacity duration-300">
                  {tab.label}
                </span>
              )}

              {isActive && (
                <div className="absolute left-0 w-1 h-6 bg-blue-400 rounded-r-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Account / Login Panel ── */}
      <div className="mt-auto w-full px-3 pt-4 border-t border-white/5">
        <SidebarAccount isCollapsed={isCollapsed} />
      </div>
    </aside>
  );
}
