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
} from "react-icons/pi";

export default function Sidebar({ activeTab, onTabChange }) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: PiHouse, isBlock: false },
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
      className={`${isCollapsed ? "w-20" : "w-64"} h-[96vh] m-[2vh] ml-4 bg-[#121212]/90 backdrop-blur-xl border border-white/10 rounded-3xl flex flex-col items-center py-6 transition-all duration-300 ease-in-out relative shadow-2xl z-50`}
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

      <div className="w-full px-4 mb-8 flex items-center justify-center">
        <div
          className={`font-black text-2xl tracking-tighter text-white transition-opacity duration-300 ${isCollapsed ? "opacity-0 w-0" : "opacity-100"}`}
        >
          OCS
        </div>
        {isCollapsed && (
          <div className="font-black text-xl text-white/20">O</div>
        )}
      </div>

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
                className={`shrink-0 transition-transform duration-200 ${isActive ? "scale-110" : "group-hover:scale-110"}`}
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

      {/* User Profile / Bottom Section */}
      <div className="mt-auto w-full px-3 pt-4 border-t border-white/5">
        <div
          className={`flex items-center p-2 rounded-2xl bg-white/5 ${isCollapsed ? "justify-center" : "gap-3"}`}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex-shrink-0" />
          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-bold text-white truncate">
                Admin User
              </span>
              <span className="text-[10px] text-white/40 truncate">
                Broadcast Mode
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
