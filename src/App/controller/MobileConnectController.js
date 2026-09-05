import React, { useEffect, useState, useRef } from "react";
import {
  PiDeviceMobile,
  PiWarning,
  PiArrowsClockwise,
  PiQrCode,
  PiPencilSimple,
  PiCheck,
  PiMicrophone,
  PiDotsThreeVertical,
  PiShieldCheck,
  PiPower,
  PiTrash,
  PiStar,
  PiPerson,
  PiWifiHigh,
  PiLockKey,
  PiLink,
  PiVideoCamera,
  PiArrowCounterClockwise,
} from "react-icons/pi";
import DisabledContainer from "../components/DisabledContainer";

function StatusDot({ active, pulse }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {pulse && (
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${
            active ? "bg-emerald-400" : "bg-amber-400"
          }`}
        />
      )}
      <span
        className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
          active ? "bg-emerald-400" : "bg-amber-400"
        }`}
      />
    </span>
  );
}

function MobileConnectPanel() {
  const [serverInfo, setServerInfo] = useState({
    ip: "Loading...",
    port: "...",
    pairingCode: "------",
    pairingQrDataUrl: null,
  });
  const [connectedDevices, setConnectedDevices] = useState([]);
  const [status, setStatus] = useState("offline");
  const [rejectedAttempts, setRejectedAttempts] = useState(0);
  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const [editNameText, setEditNameText] = useState("");
  const [activeMenuDeviceId, setActiveMenuDeviceId] = useState(null);
  const menuRef = useRef(null);

  const applyInfo = (info) => {
    setServerInfo({
      ip: info.ip,
      port: info.port,
      pairingCode: info.pairingCode || "------",
      pairingQrDataUrl: info.pairingQrDataUrl || null,
    });
    if (info.devices) setConnectedDevices(info.devices);
    setStatus(info.devices && info.devices.length > 0 ? "connected" : "ready");
  };

  const refreshInfo = () => {
    if (window.electron?.Network) {
      window.electron.Network.getServerInfo().then(applyInfo);
    }
  };

  const rotatePairing = async () => {
    if (!window.electron?.Network?.rotatePairing) return;
    const info = await window.electron.Network.rotatePairing();
    applyInfo(info);
    setRejectedAttempts(0);
  };

  const startRename = (device) => {
    setEditingDeviceId(device.id);
    setEditNameText(device.name || "Mobile Device");
  };

  const saveRename = async (deviceId) => {
    const trimmed = editNameText.trim();
    if (trimmed && window.electron?.Network?.renameDevice) {
      await window.electron.Network.renameDevice(deviceId, trimmed);
      setConnectedDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, name: trimmed } : d))
      );
    }
    setEditingDeviceId(null);
  };

  const setRole = async (device, role) => {
    setActiveMenuDeviceId(null);
    if (window.electron?.Network?.setDeviceRole) {
      await window.electron.Network.setDeviceRole(device.id, role);
      setConnectedDevices((prev) =>
        prev.map((d) =>
          d.id === device.id ? { ...d, deviceRole: role, isAdmin: role === "admin" } : d
        )
      );
    }
  };

  const handleDisconnect = (deviceId) => {
    setActiveMenuDeviceId(null);
    if (window.electron?.Network?.disconnectDevice) {
      window.electron.Network.disconnectDevice(deviceId);
    }
  };

  const handleRemoveUser = async (deviceId) => {
    setActiveMenuDeviceId(null);
    if (window.electron?.Network?.removeDevice) {
      await window.electron.Network.removeDevice(deviceId);
      setConnectedDevices((prev) => prev.filter((d) => d.id !== deviceId));
    }
  };

  const handleGrantSwitcherControl = async (deviceId) => {
    setActiveMenuDeviceId(null);
    try {
      const res = await window.electron?.Switcher?.grantControl?.(deviceId);
      if (res?.ok) {
        const dev = connectedDevices.find((d) => d.id === deviceId);
        // UI feedback (no local state needed; switcher-state-update will sync)
        console.log('[MobileConnect] Switcher control granted to:', dev?.name || deviceId);
      } else {
        console.warn('[MobileConnect] Grant switcher control failed:', res?.error);
      }
    } catch (e) {
      console.error('[MobileConnect] Grant switcher control IPC error:', e);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenuDeviceId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    refreshInfo();

    const cleanupDevicesUpdated = window.electron?.Network?.onDevicesUpdated
      ? window.electron.Network.onDevicesUpdated((devices) => {
          setConnectedDevices(devices || []);
          setStatus(devices && devices.length > 0 ? "connected" : "ready");
        })
      : () => {};

    const cleanupConnect = window.electron.Network.onMobileConnected((device) => {
      setConnectedDevices((prev) => {
        if (prev.some((d) => d.id === device.id))
          return prev.map((d) => (d.id === device.id ? device : d));
        return [...prev, device];
      });
      setStatus("connected");
    });

    const cleanupDisconnect = window.electron.Network.onMobileDisconnected((device) => {
      setConnectedDevices((prev) => {
        const next = prev.filter((d) => d.id !== device.id);
        if (next.length === 0) setStatus("ready");
        return next;
      });
    });

    const cleanupUnpaired = window.electron.Network.onMobileUnpairedAttempt
      ? window.electron.Network.onMobileUnpairedAttempt(() => {
          setRejectedAttempts((n) => n + 1);
        })
      : () => {};

    return () => {
      cleanupDevicesUpdated();
      cleanupConnect();
      cleanupDisconnect();
      cleanupUnpaired();
    };
  }, []);

  const isConnected = connectedDevices.length > 0;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden animate-fade-in">

      {/* Page Header */}
      <div className="flex-shrink-0 px-7 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-assent-300/25 to-assent-200/10 border border-assent-300/20 flex items-center justify-center">
              <PiDeviceMobile size={22} className="text-assent-300" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-light tracking-tight">Mobile Connection</h1>
              <p className="text-xs text-ash/60 mt-0.5">
                Pair and manage companion devices on your local network
              </p>
            </div>
          </div>

          <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all ${
            isConnected
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
              : "bg-white/5 border-white/10 text-white/40"
          }`}>
            <StatusDot active={isConnected} pulse={isConnected} />
            {isConnected
              ? `${connectedDevices.length} device${connectedDevices.length !== 1 ? "s" : ""} connected`
              : "Waiting for devices"}
          </div>
        </div>
        <div className="mt-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-7 pb-7">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* LEFT: QR + instructions */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {/* QR Card */}
            <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 flex flex-col items-center gap-5 overflow-hidden shadow-elevated">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-assent-200/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-assent-300/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-assent-300/80">
                <PiQrCode size={14} />
                <span>Scan to Pair</span>
              </div>

              <div className="relative">
                <div className="absolute inset-0 rounded-2xl bg-assent-300/20 blur-xl scale-90 opacity-60 pointer-events-none" />
                {serverInfo.pairingQrDataUrl ? (
                  <img
                    src={serverInfo.pairingQrDataUrl}
                    alt="OCS pairing QR code"
                    className="relative w-48 h-48 rounded-2xl bg-white p-2.5 shadow-2xl ring-2 ring-white/20"
                  />
                ) : (
                  <div className="relative w-48 h-48 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 text-white/30">
                    <PiQrCode size={40} />
                    <span className="text-xs">Generating…</span>
                  </div>
                )}
              </div>

              <div className="w-full flex flex-col items-center gap-1.5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 font-bold">Pairing Code</p>
                <div className="font-mono text-2xl font-black text-white tracking-[0.3em] select-all bg-black/30 border border-white/10 px-5 py-2 rounded-xl shadow-inner w-full text-center">
                  {serverInfo.pairingCode}
                </div>
              </div>

              <div className="w-full flex items-center gap-2.5 bg-black/20 border border-white/[0.08] rounded-xl px-4 py-2.5">
                <PiWifiHigh size={16} className="text-assent-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-0.5">Network Address</p>
                  <p className="text-sm font-mono font-bold text-white/90 select-all truncate">
                    {serverInfo.ip}
                    <span className="text-white/35 font-normal">:{serverInfo.port}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={rotatePairing}
                className="flex items-center gap-2 text-xs px-4 py-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:bg-white/[0.08] hover:border-white/20 transition-all"
              >
                <PiArrowsClockwise size={13} />
                Rotate pairing code
              </button>

              {rejectedAttempts > 0 && (
                <div className="w-full flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-xs text-amber-300">
                  <PiWarning size={14} className="flex-shrink-0" />
                  <span>{rejectedAttempts} unpaired attempt{rejectedAttempts !== 1 ? "s" : ""} blocked</span>
                </div>
              )}
            </div>

            {/* Instructions Card */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-4 flex items-center gap-2">
                <PiLockKey size={12} />
                How to Connect
              </h3>
              <div className="space-y-3">
                {[
                  { step: 1, icon: <PiWifiHigh size={13} />, text: "Join the same Wi-Fi network as this computer" },
                  { step: 2, icon: <PiDeviceMobile size={13} />, text: "Open OCS Mobile and tap Connect" },
                  { step: 3, icon: <PiQrCode size={13} />, text: "Scan the QR code or enter the IP and 6-digit code" },
                  { step: 4, icon: <PiLink size={13} />, text: "Control slides and timers remotely once paired" },
                ].map(({ step, icon, text }) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-md bg-assent-200/10 border border-assent-200/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[9px] font-black text-assent-300">{step}</span>
                    </div>
                    <div className="flex items-start gap-1.5 pt-0.5">
                      <span className="text-white/25 flex-shrink-0 mt-0.5">{icon}</span>
                      <p className="text-[11px] text-white/50 leading-relaxed">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: Devices list */}
          <div className="lg:col-span-3 flex flex-col gap-3">

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-bold text-light">Paired Devices</h2>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                  isConnected
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
                    : "bg-white/[0.08] text-white/40 border-white/10"
                }`}>
                  {connectedDevices.length}
                </span>
              </div>
              <button
                onClick={refreshInfo}
                className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/70 px-3 py-1.5 rounded-xl border border-white/[0.08] hover:bg-white/5 transition-all"
              >
                <PiArrowsClockwise size={12} />
                Refresh
              </button>
            </div>

            {connectedDevices.length === 0 ? (
              <div className="flex-1 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] flex flex-col items-center justify-center gap-4 py-16 text-center min-h-[240px]">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                  <PiDeviceMobile size={30} className="text-white/20" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/25">No devices connected yet</p>
                  <p className="text-xs text-white/15 mt-1">Scan the QR code from your mobile to pair</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2" ref={menuRef}>
                {connectedDevices.map((device, idx) => {
                  const isPending = device.status === "pending" || !device.paired;
                  const isMenuOpen = activeMenuDeviceId === device.id;
                  const role = device.deviceRole || (device.isAdmin ? "admin" : null);

                  const roleStyles = {
                    admin: { badge: "bg-purple-500/20 border-purple-500/35 text-purple-300", label: "Admin" },
                    stageManager: { badge: "bg-blue-500/20 border-blue-500/35 text-blue-300", label: "Stage Mgr" },
                    speaker: { badge: "bg-white/10 border-white/15 text-white/50", label: "Speaker" },
                  };
                  const roleStyle = roleStyles[role] || null;

                  return (
                    <div
                      key={device.id || idx}
                      className={`relative flex items-center gap-3.5 p-4 rounded-2xl border transition-all ${
                        device.isVoiceActive
                          ? "bg-amber-500/[0.08] border-amber-500/25"
                          : isPending
                          ? "bg-amber-500/[0.04] border-amber-500/15"
                          : "bg-white/[0.04] border-white/[0.08] hover:border-white/15 hover:bg-white/[0.06]"
                      }`}
                    >
                      {/* Icon */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                        device.isVoiceActive
                          ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                          : isPending
                          ? "bg-amber-500/[0.08] border-amber-500/20 text-amber-400"
                          : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                      } ${device.isVoiceActive ? "animate-pulse" : ""}`}>
                        {device.isVoiceActive
                          ? <PiMicrophone size={20} />
                          : <PiDeviceMobile size={20} />}
                      </div>

                      {/* Name + status */}
                      <div className="flex-1 min-w-0">
                        {editingDeviceId === device.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editNameText}
                              onChange={(e) => setEditNameText(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && saveRename(device.id)}
                              autoFocus
                              className="bg-black/40 border border-assent-200/40 text-white px-2.5 py-1 rounded-lg text-sm font-bold w-44 focus:outline-none focus:ring-1 focus:ring-assent-200/60"
                            />
                            <button
                              onClick={() => saveRename(device.id)}
                              className="p-1.5 bg-assent-200/80 hover:bg-assent-200 text-white rounded-lg transition-colors"
                            >
                              <PiCheck size={13} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group">
                            <span className="font-bold text-white text-sm truncate" title={device.name}>
                              {device.name || `Device ${idx + 1}`}
                            </span>
                            {roleStyle && (
                              <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide border ${roleStyle.badge}`}>
                                {roleStyle.label}
                              </span>
                            )}
                            <button
                              onClick={() => startRename(device)}
                              className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-white/80 p-0.5 transition-all"
                            >
                              <PiPencilSimple size={13} />
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/30 font-mono">
                          <span className="truncate max-w-[130px]">{device.ip || device.id}</span>
                          <span className="text-white/15">·</span>
                          <span className={`font-sans font-semibold ${isPending ? "text-amber-400/80" : "text-emerald-400/80"}`}>
                            {isPending ? "Awaiting pairing" : "Active"}
                          </span>
                        </div>
                      </div>

                      {/* Right */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {device.isVoiceActive && (
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg animate-pulse">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            Mic On
                          </div>
                        )}
                        <StatusDot active={!isPending} pulse={isPending} />
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setActiveMenuDeviceId(isMenuOpen ? null : device.id)}
                            className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-all ${
                              isMenuOpen
                                ? "bg-white/15 border-white/25 text-white"
                                : "bg-white/[0.05] border-white/10 text-white/50 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            <PiDotsThreeVertical size={16} />
                          </button>

                          {isMenuOpen && (
                            <div className="absolute right-0 top-10 w-52 bg-[#16131F]/96 backdrop-blur-xl border border-white/12 rounded-2xl shadow-2xl z-50 py-2 animate-in fade-in zoom-in-95 duration-150">
                              <div className="px-3 py-1 mb-1">
                                <p className="text-[9px] uppercase tracking-[0.15em] text-white/25 font-bold mb-2">Set Role</p>
                                {[
                                  { role: "admin", label: "Admin", icon: <PiShieldCheck size={14} className="text-purple-400" />, desc: "Full control & peer access" },
                                  { role: "stageManager", label: "Stage Manager", icon: <PiStar size={14} className="text-blue-400" />, desc: "Stage controls only" },
                                  { role: "speaker", label: "Speaker", icon: <PiPerson size={14} className="text-white/40" />, desc: "Peers & microphone only" },
                                ].map(({ role: r, label, icon, desc }) => {
                                  const isActive = (device.deviceRole || (device.isAdmin ? "admin" : "speaker")) === r;
                                  return (
                                    <button
                                      key={r}
                                      type="button"
                                      onClick={() => setRole(device, r)}
                                      className={`w-full px-2.5 py-2 mb-0.5 text-left text-xs flex items-center gap-2.5 rounded-xl transition-colors ${
                                        isActive ? "bg-white/12 text-white" : "text-white/60 hover:bg-white/[0.08] hover:text-white"
                                      }`}
                                    >
                                      {icon}
                                      <div className="flex-1">
                                        <div className="font-bold leading-none">{label}</div>
                                        <div className="text-[10px] text-white/35 mt-0.5">{desc}</div>
                                      </div>
                                      {isActive && <PiCheck size={12} className="text-emerald-400 flex-shrink-0" />}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="mx-3 border-t border-white/[0.08] my-1" />
                              {/* Grant Switcher Control */}
                              {device.paired && (
                                <button
                                  type="button"
                                  onClick={() => handleGrantSwitcherControl(device.id)}
                                  className="w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center gap-2.5 hover:bg-red-500/10 text-red-300/70 hover:text-red-300 transition-colors"
                                  title="Grant this device switcher controller permission (separate from admin role)"
                                >
                                  <PiVideoCamera size={14} className="text-red-400" />
                                  Grant Switcher Control
                                </button>
                              )}
                              <div className="mx-3 border-t border-white/[0.08] my-1" />
                              <button
                                type="button"
                                onClick={() => handleDisconnect(device.id)}
                                className="w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center gap-2.5 hover:bg-amber-500/10 text-amber-300/80 hover:text-amber-300 transition-colors"
                              >
                                <PiPower size={14} className="text-amber-400" />
                                Disconnect
                              </button>
                              <div className="mx-3 border-t border-white/[0.08] my-1" />
                              <button
                                type="button"
                                onClick={() => handleRemoveUser(device.id)}
                                className="w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center gap-2.5 hover:bg-red-500/15 text-red-400/70 hover:text-red-400 transition-colors"
                              >
                                <PiTrash size={14} className="text-red-400" />
                                Remove Device
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Security notice */}
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-white/[0.025] border border-white/[0.06] mt-1">
              <PiLockKey size={13} className="text-assent-300/50 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-white/25 leading-relaxed">
                Only devices on the same local network with the correct pairing code can connect. Guest Wi-Fi devices are blocked automatically.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MobileConnectController() {
  return (
    <DisabledContainer
      featureName="Remote & Mobile Pairing"
      description="Log in to pair mobile devices and enable remote control of slides and timers."
    >
      <MobileConnectPanel />
    </DisabledContainer>
  );
}
