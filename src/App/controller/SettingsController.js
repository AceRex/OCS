
function formatPlanDetails(planKey, rawDays, { isAuthenticated = true, guestExpired = false, guestRemainingMinutes = 60 } = {}) {
    if (!isAuthenticated) {
        if (guestExpired) {
            return {
                name: "1-Hour Guest Session (Expired)",
                daysLabel: "0 Mins (All Features Locked)",
                daysColor: "text-rose-400",
                days: 0,
                isGuest: true,
                guestExpired: true,
            };
        }
        return {
            name: "Guest Evaluation (1-Hour Access)",
            daysLabel: `${guestRemainingMinutes} Mins Left to Activate`,
            daysColor: guestRemainingMinutes <= 10 ? "text-rose-400" : "text-amber-400",
            days: 0,
            isGuest: true,
            guestExpired: false,
        };
    }

    const p = (planKey || "trial").toLowerCase();
    let name = "2-Month Free Trial (Mini Setup)";
    
    if (p === "mini") {
        name = "Mini Setup ($2 / 6 Months)";
    } else if (p === "standard") {
        name = "Standard Setup ($3 / 6 Months)";
    } else if (p === "large") {
        name = "Large Setup ($5 / 6 Months)";
    } else if (p === "premium") {
        name = "Premium Enterprise (Unlimited)";
    } else if (p === "free") {
        name = "Free Mode (Timer & Broadcast)";
    }

    const days = rawDays !== undefined && rawDays !== null ? Number(rawDays) : (p === "free" ? 0 : 60);
    let daysLabel = days + " Days Remaining";
    let daysColor = "text-emerald-400";
    
    if (p === "free") {
        daysLabel = "Continuous Free Mode";
        daysColor = "text-slate-400";
    } else if (p === "premium") {
        daysLabel = "Continuous Enterprise Access";
        daysColor = "text-amber-400";
    } else if (days <= 0) {
        daysLabel = "0 Days Left (Switched to Free Mode)";
        daysColor = "text-red-400";
    } else if (days <= 10) {
        daysLabel = days + " Days Left (Expiring Soon)";
        daysColor = "text-amber-400";
    }

    return { name, daysLabel, daysColor, days, isGuest: false, guestExpired: false };
}

import React, { useState, useEffect, useRef } from "react";
import DisabledContainer from "../components/DisabledContainer";
import { useAuth } from "../context/AuthContext";
import { useAppUpdater } from "../hooks/useAppUpdater";
import {
    PiTextT,
    PiPaintBucket,
    PiGear,
    PiBook,
    PiPalette,
    PiTranslate,
    PiArrowsOut,
    PiMicrophone,
    PiMoon,
    PiVideo,
    PiUploadSimple,
    PiTrash,
    PiCheckCircle,
    PiPlayCircle,
    PiFilmStrip,
    PiClock,
    PiWarning,
    PiArrowCounterClockwise,
    PiShieldCheck,
    PiTextAlignLeft,
    PiTextAlignCenter,
    PiTextAlignRight,
    PiSparkle,
    PiCheck,
    PiLockKey,
    PiSignOut,
    PiCpu,
    PiMonitor,
    PiPower,
    PiX,
    PiDownloadSimple,
    PiArrowClockwise,
    PiSpinner,
} from "react-icons/pi";

const TRANSLATIONS = ['KJV', 'NIV', 'ESV', 'NKJV', 'NLT', 'AMP', 'MSG', 'CSB', 'NASB', 'RSV', 'ASV'];

const REF_POSITIONS = [
    { value: 'top-center',    label: 'Top Center' },
    { value: 'top-left',      label: 'Top Left' },
    { value: 'top-right',     label: 'Top Right' },
    { value: 'bottom-center', label: 'Bottom Center' },
    { value: 'bottom-left',   label: 'Bottom Left' },
    { value: 'bottom-right',  label: 'Bottom Right' },
];

const BODY_POSITIONS = [
    { value: 'center',       label: 'Center (Default)' },
    { value: 'bottom-left',  label: 'Bottom Left' },
    { value: 'bottom-right', label: 'Bottom Right' },
];

const FONT_OPTIONS = [
    { id: 'Outfit', label: 'Outfit (Modern Sans)' },
    { id: 'Space Grotesk', label: 'Space Grotesk' },
    { id: 'Inter', label: 'Inter Clean' },
    { id: 'JetBrains Mono', label: 'JetBrains Mono' },
    { id: 'Georgia', label: 'Georgia Serif' },
    { id: 'Arial', label: 'Arial Classic' },
    { id: 'Courier New', label: 'Courier Mono' },
    { id: 'Times New Roman', label: 'Times Serif' },
];

const COLOR_PRESETS = [
    '#0B0814', '#000000', '#0F172A', '#1E1B4B', '#142018', '#2A1116', '#1F1A24', '#0D1117'
];

const TEXT_COLOR_PRESETS = [
    '#F5F2FA', '#FFFFFF', '#67E8F9', '#A788FA', '#FDE047', '#86EFAC', '#FCA5A5', '#E2E8F0'
];

const SAMPLE_VERSES = [
    {
        book: "JOHN",
        ref: "CHAPTER 3 · VERSE 16",
        text: "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life."
    },
    {
        book: "PSALM",
        ref: "CHAPTER 23 · VERSE 1",
        text: "The Lord is my shepherd; I shall not want. He makes me lie down in green pastures."
    },
    {
        book: "GENESIS",
        ref: "CHAPTER 1 · VERSE 1",
        text: "In the beginning God created the heavens and the earth."
    }
];

function formatBumperBytes(n) {
    if (!n || n < 1024) return `${n || 0} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SettingsController() {
    const { hasPermission } = useAuth();
    const canAccessBumpers = hasPermission('session.bumper');
    const updater = useAppUpdater();

    const [activeTab, setActiveTab] = useState('appearance');

    // Display Styles state with live two-way sync
    const [styles, setStyles] = useState({
        bgType: "color",
        backgroundColor: "#0B0814",
        textColor: "#F5F2FA",
        accentColor: "#A788FA",
        fontFamily: "Outfit",
        fontSize: "5rem",
        textAlign: "center",
        textShadow: true,
        overlayOpacity: 100,
        backgroundImage: null,
        backgroundVideo: null,
        // Bible settings
        bibleRefPosition: "top-center",
        bibleBodyPosition: "center",
        bibleTranslation: "KJV",
        bibleServiceLabel: "",
        bibleShowOrbs: true,
    });

    // App Preferences state
    const [mediaFiles, setMediaFiles] = useState([]);
    const [sleepMode, setSleepMode] = useState('always');
    const [sleepProbeOk, setSleepProbeOk] = useState(true);
    const [liveTranscriptCorrection, setLiveTranscriptCorrection] = useState(false);
    const [sessionTranscriptCleanup, setSessionTranscriptCleanup] = useState(false);
    const [scriptureReadAlong, setScriptureReadAlong] = useState(true);
    const [transcriptionLanguage, setTranscriptionLanguage] = useState('en');
    const [languageGateEnabled, setLanguageGateEnabled] = useState(true);
    const [asrStatus, setAsrStatus] = useState(null);

    // Bumpers state (Intro / Outro)
    const [bumpers, setBumpers] = useState({ intro: null, outro: null, autoMerge: true });
    const [bumperBusy, setBumperBusy] = useState(false);
    const [bumperError, setBumperError] = useState(null);

    // Live Sync feedback
    const [syncFeedback, setSyncFeedback] = useState('synced'); // 'synced' | 'saving' | 'saved'
    const syncTimerRef = useRef(null);

    // Sample verse index for preview swatch
    const [previewVerseIdx, setPreviewVerseIdx] = useState(0);

    // Reset confirmation modal
    const [showResetModal, setShowResetModal] = useState(false);

    const [startAtLogin, setStartAtLogin] = useState(false);

    // Auth context for account info
    const authContext = useAuth ? useAuth() : null;

    // Load initial settings and styles
    useEffect(() => {
        const loadAll = async () => {
            if (window.electron?.Settings?.get) {
                try {
                    const s = await window.electron.Settings.get();
                    if (s) {
                        if (s.sleepPrevention) setSleepMode(s.sleepPrevention);
                        setLiveTranscriptCorrection(!!s.liveTranscriptCorrection);
                        setSessionTranscriptCleanup(!!s.sessionTranscriptCleanup);
                        setScriptureReadAlong(s.scriptureReadAlong !== false);
                        setTranscriptionLanguage(s.transcriptionLanguage || 'en');
                        setLanguageGateEnabled(s.languageGateEnabled !== false);
                        if (s.styles) {
                            setStyles(prev => ({ ...prev, ...s.styles }));
                        }
                    }
                } catch (e) {
                    console.error("Failed to load settings:", e);
                }
            }

            if (window.electron?.Settings?.getLoginItem) {
                try {
                    const isBoot = await window.electron.Settings.getLoginItem();
                    setStartAtLogin(!!isBoot);
                } catch (_) {}
            }

            if (window.electron?.Presentation?.getStyle) {
                try {
                    const activeStyle = await window.electron.Presentation.getStyle();
                    if (activeStyle && Object.keys(activeStyle).length > 0) {
                        setStyles(prev => ({ ...prev, ...activeStyle }));
                    }
                } catch (_) {}
            }

            if (window.electron?.Sleep?.probe) {
                try {
                    const p = await window.electron.Sleep.probe();
                    setSleepProbeOk(!!p?.ok);
                } catch (_) {}
            }

            if (window.electron?.Bumper?.get) {
                try {
                    const b = await window.electron.Bumper.get();
                    if (b) setBumpers(b);
                } catch (_) {}
            }

            if (window.electron?.Asr?.getStatus) {
                try {
                    const asr = await window.electron.Asr.getStatus();
                    if (asr) setAsrStatus(asr);
                } catch (_) {}
            }
        };

        loadAll();

        // ─── Real-time Subscriptions ───
        const unsubStyle = window.electron?.Presentation?.onSetStyle?.((newStyle) => {
            if (newStyle && typeof newStyle === 'object') {
                setStyles(prev => ({ ...prev, ...newStyle }));
            }
        });

        const unsubSettings = window.electron?.Settings?.onUpdated?.((updated) => {
            if (updated) {
                if (updated.sleepPrevention) setSleepMode(updated.sleepPrevention);
                setLiveTranscriptCorrection(!!updated.liveTranscriptCorrection);
                setSessionTranscriptCleanup(!!updated.sessionTranscriptCleanup);
                setScriptureReadAlong(updated.scriptureReadAlong !== false);
                setTranscriptionLanguage(updated.transcriptionLanguage || 'en');
                setLanguageGateEnabled(updated.languageGateEnabled !== false);
                if (updated.styles) {
                    setStyles(prev => ({ ...prev, ...updated.styles }));
                }
            }
        });

        const loadMedia = async () => {
            if (window.electron?.Media?.list) {
                try {
                    const files = await window.electron.Media.list();
                    if (Array.isArray(files)) setMediaFiles(files);
                } catch (_) {}
            }
        };
        loadMedia();

        const unsubMedia = window.electron?.Media?.onMediaUpdated?.(() => {
            loadMedia();
        });

        const unsubBumpers = window.electron?.Bumper?.onBumpersUpdated?.(async () => {
            if (window.electron?.Bumper?.get) {
                try {
                    const b = await window.electron.Bumper.get();
                    if (b) setBumpers(b);
                } catch (_) {}
            }
        });

        const unsubAsr = window.electron?.Asr?.onStatus?.((st) => {
            if (st) setAsrStatus(st);
        });

        return () => {
            unsubStyle?.();
            unsubSettings?.();
            unsubMedia?.();
            unsubBumpers?.();
            unsubAsr?.();
        };
    }, []);

    const triggerSaveFeedback = () => {
        setSyncFeedback('saved');
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(() => {
            setSyncFeedback('synced');
        }, 2200);
    };

    const updateStyle = (key, value) => {
        const newStyles = { ...styles, [key]: value };
        setStyles(newStyles);
        if (window.electron?.Presentation?.setStyle) {
            window.electron.Presentation.setStyle({ [key]: value });
        }
        // Persist to disk so styles survive restart
        if (window.electron?.Settings?.set) {
            window.electron.Settings.set({ styles: newStyles }).catch(() => {});
        }
        triggerSaveFeedback();
    };

    const updateStyles = (patch) => {
        const newStyles = { ...styles, ...patch };
        setStyles(newStyles);
        if (window.electron?.Presentation?.setStyle) {
            window.electron.Presentation.setStyle(patch);
        }
        // Persist to disk so styles survive restart
        if (window.electron?.Settings?.set) {
            window.electron.Settings.set({ styles: newStyles }).catch(() => {});
        }
        triggerSaveFeedback();
    };

    const handleUploadBumper = async (type) => {
        setBumperBusy(true);
        setBumperError(null);
        try {
            const res = await window.electron?.Bumper?.upload?.(type);
            if (res) {
                setBumpers((prev) => ({ ...prev, [type]: res }));
                triggerSaveFeedback();
            }
        } catch (e) {
            setBumperError(e.message || `Failed to upload ${type} clip`);
        } finally {
            setBumperBusy(false);
        }
    };

    const handleRemoveBumper = async (type) => {
        setBumperBusy(true);
        setBumperError(null);
        try {
            await window.electron?.Bumper?.remove?.(type);
            setBumpers((prev) => ({ ...prev, [type]: null }));
            triggerSaveFeedback();
        } catch (e) {
            setBumperError(e.message || `Failed to remove ${type} clip`);
        } finally {
            setBumperBusy(false);
        }
    };

    const handleToggleAutoMerge = async (enabled) => {
        setBumpers((prev) => ({ ...prev, autoMerge: enabled }));
        if (window.electron?.Bumper?.setAutoMerge) {
            await window.electron.Bumper.setAutoMerge(enabled);
            triggerSaveFeedback();
        }
    };

    const setSleepPreventionMode = async (mode) => {
        setSleepMode(mode);
        if (window.electron?.Sleep?.setMode) {
            await window.electron.Sleep.setMode(mode);
        }
        if (window.electron?.Settings?.set) {
            await window.electron.Settings.set({ sleepPrevention: mode });
        }
        triggerSaveFeedback();
    };

    const setLiveCorrection = async (on) => {
        setLiveTranscriptCorrection(on);
        if (window.electron?.Settings?.set) {
            await window.electron.Settings.set({ liveTranscriptCorrection: !!on });
        }
        triggerSaveFeedback();
    };

    const setSessionCleanup = async (on) => {
        setSessionTranscriptCleanup(on);
        if (window.electron?.Settings?.set) {
            await window.electron.Settings.set({ sessionTranscriptCleanup: !!on });
        }
        triggerSaveFeedback();
    };

    const setReadAlong = async (on) => {
        setScriptureReadAlong(on);
        if (window.electron?.Settings?.set) {
            await window.electron.Settings.set({ scriptureReadAlong: !!on });
        }
        triggerSaveFeedback();
    };

    const setTranscriptionLang = async (code) => {
        setTranscriptionLanguage(code);
        if (window.electron?.Settings?.set) {
            await window.electron.Settings.set({ transcriptionLanguage: code });
        }
        triggerSaveFeedback();
    };

    const setLanguageGate = async (on) => {
        setLanguageGateEnabled(on);
        if (window.electron?.Settings?.set) {
            await window.electron.Settings.set({ languageGateEnabled: !!on });
        }
        triggerSaveFeedback();
    };

    const toggleStartAtLogin = async () => {
        const next = !startAtLogin;
        setStartAtLogin(next);
        if (window.electron?.Settings?.setLoginItem) {
            try {
                await window.electron.Settings.setLoginItem(next);
                triggerSaveFeedback();
            } catch (e) {
                console.error("Failed to update start at login:", e);
            }
        }
    };

    const handleResetToDefaults = async () => {
        setShowResetModal(false);
        if (window.electron?.Settings?.resetDefaults) {
            try {
                const def = await window.electron.Settings.resetDefaults();
                if (def) {
                    if (def.styles) setStyles(def.styles);
                    if (def.sleepPrevention) setSleepMode(def.sleepPrevention);
                    setLiveTranscriptCorrection(!!def.liveTranscriptCorrection);
                    setSessionTranscriptCleanup(!!def.sessionTranscriptCleanup);
                    setScriptureReadAlong(def.scriptureReadAlong !== false);
                    setTranscriptionLanguage(def.transcriptionLanguage || 'en');
                    setLanguageGateEnabled(def.languageGateEnabled !== false);
                    triggerSaveFeedback();
                }
            } catch (e) {
                console.error("Failed to reset defaults:", e);
            }
        }
    };

    const tabs = [
        { id: 'appearance', label: 'Appearance', icon: <PiPalette size={16} /> },
        { id: 'scripture', label: 'Scripture AI', icon: <PiBook size={16} /> },
        { id: 'media', label: 'Media & Assets', icon: <PiPaintBucket size={16} /> },
        { id: 'bumpers', label: 'Bumpers', icon: <PiFilmStrip size={16} /> },
        { id: 'voice', label: 'Voice & AI', icon: <PiMicrophone size={16} /> },
        { id: 'system', label: 'System & License', icon: <PiShieldCheck size={16} /> },
    ];

    const currentVerse = SAMPLE_VERSES[previewVerseIdx];

    return (
        <div className="flex flex-col gap-0 text-white h-full overflow-hidden font-outfit bg-[#0B0814]"
             style={{ fontFamily: "'Outfit', 'Space Grotesk', sans-serif" }}>
            
            {/* ─── Header & Sync Status Bar ─── */}
            <div className="px-8 pt-6 pb-5 border-b border-[#2E2542] bg-[#0E0A1A]/80 backdrop-blur-md">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#7C3AED]/30 to-[#06B6D4]/30 border border-[#A788FA]/30 flex items-center justify-center text-[#A788FA] shadow-lg shadow-purple-900/20">
                            <PiGear size={22} className="animate-spin-slow" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black uppercase tracking-widest text-[#F5F2FA]">Settings & Synchronization</h2>
                            <p className="text-[10px] text-[#8882A4] font-bold uppercase tracking-widest">OCS Global Workstation Configuration</p>
                        </div>
                    </div>

                    {/* Live Sync Badge & Reset Action */}
                    <div className="flex items-center gap-3">
                        <div className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${
                            syncFeedback === 'saved'
                                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                                : 'bg-[#1A1428] border border-[#2E2542] text-[#8882A4]'
                        }`}>
                            {syncFeedback === 'saved' ? (
                                <>
                                    <PiCheckCircle size={14} className="text-emerald-400 animate-bounce" />
                                    <span>Saved & Synced</span>
                                </>
                            ) : (
                                <>
                                    <div className="w-2 h-2 rounded-full bg-emerald-400/80 animate-pulse" />
                                    <span className="text-[11px]">Synced to Disk</span>
                                </>
                            )}
                        </div>

                        <button
                            onClick={() => setShowResetModal(true)}
                            title="Reset all settings to defaults"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/25 text-[#8882A4] hover:text-red-300 text-xs font-bold transition-colors"
                        >
                            <PiArrowCounterClockwise size={13} />
                            <span>Reset Defaults</span>
                        </button>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                                activeTab === tab.id
                                    ? 'bg-gradient-to-r from-[#A788FA] to-[#818cf8] text-[#0B0814] shadow-md shadow-purple-500/20'
                                    : 'bg-[#1A1428] text-[#8882A4] hover:text-white hover:bg-[#231A36] border border-[#2E2542]'
                            }`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ─── Main Content Scroll Area ─── */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar">

                {/* ══════════════════════════════════════════════════════════════
                    1. APPEARANCE TAB
                ══════════════════════════════════════════════════════════════ */}
                {activeTab === 'appearance' && (
                    <div className="space-y-6 max-w-4xl">
                        {/* Live Swatch Preview */}
                        <div className="bg-[#1A1428] border border-[#2E2542] p-6 rounded-3xl space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-xs font-black text-[#8882A4] uppercase tracking-widest flex items-center gap-2">
                                        <PiMonitor size={16} /> Live Display Swatch Preview
                                    </h3>
                                    <p className="text-[11px] text-[#8882A4]">Real-time visual reflection on Speaker & General screens</p>
                                </div>
                                <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 font-mono text-[10px] text-[#A788FA]">
                                    {styles.fontFamily} · {styles.backgroundColor}
                                </span>
                            </div>

                            <div
                                className="w-full rounded-2xl overflow-hidden border border-[#2E2542] relative flex items-center justify-center p-8 transition-all"
                                style={{
                                    aspectRatio: '16/7',
                                    backgroundColor: styles.backgroundColor,
                                    backgroundImage: styles.backgroundImage ? `url(${styles.backgroundImage})` : undefined,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                }}
                            >
                                {styles.backgroundVideo && (
                                    <video src={styles.backgroundVideo} autoPlay loop muted className="absolute inset-0 w-full h-full object-cover opacity-60" />
                                )}
                                <div className="relative z-10 text-center space-y-2 max-w-xl">
                                    <div
                                        className="text-2xl md:text-3xl font-extrabold transition-all"
                                        style={{
                                            fontFamily: styles.fontFamily,
                                            color: styles.textColor,
                                            textShadow: styles.textShadow ? '0 4px 20px rgba(0,0,0,0.8)' : 'none',
                                            textAlign: styles.textAlign || 'center',
                                        }}
                                    >
                                        "Let There Be Light"
                                    </div>
                                    <p className="text-xs font-mono uppercase tracking-widest" style={{ color: styles.accentColor || '#A788FA' }}>
                                        ORGANIZED CHURCH SERVICE · LIVE BROADCAST
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Colors Section */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Background Color */}
                            <div className="bg-[#1A1428] border border-[#2E2542] p-5 rounded-3xl space-y-4">
                                <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest flex items-center gap-2">
                                    <PiPaintBucket /> Stage Background Color
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={styles.backgroundColor || '#0B0814'}
                                        onChange={(e) => updateStyle("backgroundColor", e.target.value)}
                                        className="w-12 h-12 rounded-2xl cursor-pointer bg-transparent border border-white/10"
                                    />
                                    <input
                                        type="text"
                                        value={styles.backgroundColor || '#0B0814'}
                                        onChange={(e) => updateStyle("backgroundColor", e.target.value)}
                                        className="bg-[#0B0814] border border-[#2E2542] rounded-xl px-3 py-2 text-xs font-mono text-white w-28 uppercase focus:border-[#A788FA] outline-none"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {COLOR_PRESETS.map((color) => (
                                        <button
                                            key={color}
                                            onClick={() => updateStyle("backgroundColor", color)}
                                            style={{ backgroundColor: color }}
                                            className={`w-6 h-6 rounded-lg border transition-transform ${
                                                styles.backgroundColor === color ? 'border-[#A788FA] scale-110 shadow-md' : 'border-white/15 hover:scale-105'
                                            }`}
                                            title={color}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Text & Accent Color */}
                            <div className="bg-[#1A1428] border border-[#2E2542] p-5 rounded-3xl space-y-4">
                                <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest flex items-center gap-2">
                                    <PiTextT /> Primary Text & Accent Colors
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <span className="text-[10px] text-[#8882A4] font-bold block mb-1">Text Color</span>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={styles.textColor || '#F5F2FA'}
                                                onChange={(e) => updateStyle("textColor", e.target.value)}
                                                className="w-8 h-8 rounded-xl cursor-pointer bg-transparent border border-white/10"
                                            />
                                            <input
                                                type="text"
                                                value={styles.textColor || '#F5F2FA'}
                                                onChange={(e) => updateStyle("textColor", e.target.value)}
                                                className="bg-[#0B0814] border border-[#2E2542] rounded-lg px-2 py-1 text-xs font-mono text-white w-20 uppercase focus:border-[#A788FA] outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-[#8882A4] font-bold block mb-1">Accent Glow</span>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={styles.accentColor || '#A788FA'}
                                                onChange={(e) => updateStyle("accentColor", e.target.value)}
                                                className="w-8 h-8 rounded-xl cursor-pointer bg-transparent border border-white/10"
                                            />
                                            <input
                                                type="text"
                                                value={styles.accentColor || '#A788FA'}
                                                onChange={(e) => updateStyle("accentColor", e.target.value)}
                                                className="bg-[#0B0814] border border-[#2E2542] rounded-lg px-2 py-1 text-xs font-mono text-white w-20 uppercase focus:border-[#A788FA] outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {TEXT_COLOR_PRESETS.map((color) => (
                                        <button
                                            key={color}
                                            onClick={() => updateStyle("textColor", color)}
                                            style={{ backgroundColor: color }}
                                            className={`w-6 h-6 rounded-lg border transition-transform ${
                                                styles.textColor === color ? 'border-[#A788FA] scale-110 shadow-md' : 'border-white/15 hover:scale-105'
                                            }`}
                                            title={color}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Typography & Layout */}
                        <div className="bg-[#1A1428] border border-[#2E2542] p-5 rounded-3xl space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest">
                                    Display Typography & Alignment
                                </label>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => updateStyle("textAlign", "left")}
                                        className={`p-2 rounded-xl border ${styles.textAlign === 'left' ? 'bg-[#A788FA]/20 border-[#A788FA] text-[#A788FA]' : 'border-[#2E2542] text-[#8882A4]'}`}
                                        title="Align Left"
                                    ><PiTextAlignLeft size={16} /></button>
                                    <button
                                        onClick={() => updateStyle("textAlign", "center")}
                                        className={`p-2 rounded-xl border ${styles.textAlign === 'center' ? 'bg-[#A788FA]/20 border-[#A788FA] text-[#A788FA]' : 'border-[#2E2542] text-[#8882A4]'}`}
                                        title="Align Center"
                                    ><PiTextAlignCenter size={16} /></button>
                                    <button
                                        onClick={() => updateStyle("textAlign", "right")}
                                        className={`p-2 rounded-xl border ${styles.textAlign === 'right' ? 'bg-[#A788FA]/20 border-[#A788FA] text-[#A788FA]' : 'border-[#2E2542] text-[#8882A4]'}`}
                                        title="Align Right"
                                    ><PiTextAlignRight size={16} /></button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {FONT_OPTIONS.map((f) => (
                                    <button
                                        key={f.id}
                                        onClick={() => updateStyle('fontFamily', f.id)}
                                        className={`px-4 py-3 rounded-2xl text-xs font-bold border transition-all text-left ${
                                            styles.fontFamily === f.id
                                                ? 'bg-[#A788FA]/20 border-[#A788FA] text-[#A788FA] shadow-md'
                                                : 'bg-transparent border-[#2E2542] text-[#8882A4] hover:border-white/20 hover:text-white'
                                        }`}
                                    >
                                        <span style={{ fontFamily: f.id }} className="block text-sm font-black mb-0.5">Aa Bb Cc</span>
                                        <span className="text-[10px] text-[#8882A4] block truncate">{f.label}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="border-t border-[#2E2542] pt-4 flex items-center justify-between">
                                <div>
                                    <span className="text-xs font-bold text-[#F5F2FA] block">Subtle Text Shadow</span>
                                    <span className="text-[10px] text-[#8882A4]">Enhances legibility over live video backgrounds</span>
                                </div>
                                <button
                                    onClick={() => updateStyle('textShadow', !styles.textShadow)}
                                    className={`relative w-12 h-6 rounded-full transition-colors ${styles.textShadow ? 'bg-[#A788FA]' : 'bg-[#2E2542]'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${styles.textShadow ? 'left-7' : 'left-1'}`} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════════
                    2. SCRIPTURE TAB
                ══════════════════════════════════════════════════════════════ */}
                {activeTab === 'scripture' && (
                    <div className="space-y-6 max-w-4xl">
                        {/* Interactive Preview Canvas */}
                        <div className="w-full rounded-3xl overflow-hidden border border-[#2E2542] bg-[#0B0814] relative shadow-2xl" style={{ aspectRatio: '16/9' }}>
                            {/* Orb Lighting Glow */}
                            {styles.bibleShowOrbs && (
                                <>
                                    <div style={{ position:'absolute', top:'-15%', left:'-15%', width:'55%', height:'55%', borderRadius:'50%', background:'radial-gradient(circle, rgba(167,136,250,0.45) 0%, rgba(167,136,250,0.1) 55%, transparent 70%)', filter:'blur(4px)' }} />
                                    <div style={{ position:'absolute', bottom:'-15%', right:'-15%', width:'50%', height:'50%', borderRadius:'50%', background:'radial-gradient(circle, rgba(103,232,249,0.35) 0%, rgba(103,232,249,0.08) 55%, transparent 70%)', filter:'blur(4px)' }} />
                                </>
                            )}

                            {/* Reference Pill Position */}
                            <div className={`absolute p-6 inset-x-0 ${styles.bibleRefPosition?.includes('bottom') ? 'bottom-0' : 'top-0'} flex ${
                                styles.bibleRefPosition?.includes('left') ? 'justify-start' : styles.bibleRefPosition?.includes('right') ? 'justify-end' : 'justify-center'
                            }`}>
                                <span className="px-4 py-1.5 rounded-full bg-[#1A1428]/80 border border-[#2E2542] backdrop-blur-md font-mono text-[11px] font-bold uppercase tracking-widest text-[#67E8F9] shadow-lg">
                                    {currentVerse.book} · <span className="text-[#A788FA]">{currentVerse.ref}</span>
                                </span>
                            </div>

                            {/* Body Text Position */}
                            <div className={`absolute inset-0 flex p-12 ${
                                styles.bibleBodyPosition === 'bottom-left' ? 'items-end justify-start text-left' :
                                styles.bibleBodyPosition === 'bottom-right' ? 'items-end justify-end text-right' :
                                'items-center justify-center text-center'
                            }`}>
                                <p
                                    style={{
                                        fontFamily: styles.fontFamily || 'Outfit',
                                        fontSize: '2.1vw',
                                        fontWeight: 800,
                                        color: styles.textColor || '#F5F2FA',
                                        lineHeight: 1.25,
                                        maxWidth: '85%',
                                        textShadow: styles.textShadow ? '0 4px 24px rgba(0,0,0,0.9)' : 'none',
                                    }}
                                >
                                    "{currentVerse.text}"
                                </p>
                            </div>

                            {/* Translation & Service Label */}
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
                                <span className="font-mono text-[10px] text-white/40 uppercase tracking-widest bg-black/40 px-3 py-1 rounded-full border border-white/5">
                                    {styles.bibleTranslation || 'KJV'}{styles.bibleServiceLabel ? ` · ${styles.bibleServiceLabel}` : ''}
                                </span>
                            </div>

                            {/* Switch sample verse button */}
                            <button
                                onClick={() => setPreviewVerseIdx((prev) => (prev + 1) % SAMPLE_VERSES.length)}
                                className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl backdrop-blur-sm border border-white/10 transition-colors"
                            >
                                Next Sample
                            </button>
                        </div>

                        {/* Translation & Service Label Configuration */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Translation Selector */}
                            <div className="bg-[#1A1428] border border-[#2E2542] p-5 rounded-3xl space-y-3">
                                <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest flex items-center gap-2">
                                    <PiTranslate /> Default Scripture Translation
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {TRANSLATIONS.map(t => (
                                        <button
                                            key={t}
                                            onClick={() => updateStyle('bibleTranslation', t)}
                                            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                                styles.bibleTranslation === t
                                                    ? 'bg-[#67E8F9]/20 border-[#67E8F9] text-[#67E8F9] shadow-sm'
                                                    : 'bg-transparent border-[#2E2542] text-[#8882A4] hover:border-white/20 hover:text-white'
                                            }`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Service Label */}
                            <div className="bg-[#1A1428] border border-[#2E2542] p-5 rounded-3xl space-y-3">
                                <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest">
                                    Church Service Label
                                </label>
                                <input
                                    type="text"
                                    value={styles.bibleServiceLabel || ''}
                                    onChange={(e) => updateStyle('bibleServiceLabel', e.target.value)}
                                    placeholder="e.g. Sunday Worship Celebration"
                                    className="w-full bg-[#0B0814] border border-[#2E2542] rounded-2xl px-4 py-3 text-sm text-white placeholder-[#4C4362] outline-none focus:border-[#A788FA] transition-colors"
                                />
                                <p className="text-[10px] text-[#8882A4]">Appears on bottom watermark and stage reference headers.</p>
                            </div>
                        </div>

                        {/* Reference & Body Layout */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Reference Position */}
                            <div className="bg-[#1A1428] border border-[#2E2542] p-5 rounded-3xl space-y-3">
                                <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest flex items-center gap-2">
                                    <PiArrowsOut /> Reference Badge Position
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {REF_POSITIONS.map(pos => (
                                        <button
                                            key={pos.value}
                                            onClick={() => updateStyle('bibleRefPosition', pos.value)}
                                            className={`px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all text-center ${
                                                styles.bibleRefPosition === pos.value
                                                    ? 'bg-[#A788FA]/20 border-[#A788FA] text-[#A788FA] shadow-sm'
                                                    : 'bg-transparent border-[#2E2542] text-[#8882A4] hover:border-white/20 hover:text-white'
                                            }`}
                                        >
                                            {pos.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Body Alignment & Read-Along */}
                            <div className="bg-[#1A1428] border border-[#2E2542] p-5 rounded-3xl space-y-3">
                                <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest">
                                    Scripture Body Placement
                                </label>
                                <div className="flex gap-2">
                                    {BODY_POSITIONS.map(pos => (
                                        <button
                                            key={pos.value}
                                            onClick={() => updateStyle('bibleBodyPosition', pos.value)}
                                            className={`flex-1 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border text-center transition-all ${
                                                styles.bibleBodyPosition === pos.value
                                                    ? 'bg-[#A788FA]/20 border-[#A788FA] text-[#A788FA]'
                                                    : 'bg-transparent border-[#2E2542] text-[#8882A4] hover:border-white/20 hover:text-white'
                                            }`}
                                        >
                                            {pos.label.replace(' (Default)', '')}
                                        </button>
                                    ))}
                                </div>

                                <div className="mt-2 pt-3 border-t border-[#2E2542] flex items-center justify-between">
                                    <div>
                                        <span className="text-xs font-bold text-[#F5F2FA] block">Ambient Lighting Orbs</span>
                                        <span className="text-[10px] text-[#8882A4]">Cyan & Purple atmospheric glow</span>
                                    </div>
                                    <button
                                        onClick={() => updateStyle('bibleShowOrbs', !styles.bibleShowOrbs)}
                                        className={`relative w-12 h-6 rounded-full transition-colors ${styles.bibleShowOrbs ? 'bg-[#A788FA]' : 'bg-[#2E2542]'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${styles.bibleShowOrbs ? 'left-7' : 'left-1'}`} />
                                    </button>
                                </div>

                                <div className="mt-2 pt-3 border-t border-[#2E2542] flex items-center justify-between">
                                    <div>
                                        <span className="text-xs font-bold text-[#F5F2FA] block">Scripture Read-Along (Speaker)</span>
                                        <span className="text-[10px] text-[#8882A4]">Teleprompt word-pop on Speaker View only</span>
                                    </div>
                                    <button
                                        onClick={() => setReadAlong(!scriptureReadAlong)}
                                        className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${scriptureReadAlong ? 'bg-[#A788FA]' : 'bg-[#2E2542]'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${scriptureReadAlong ? 'left-7' : 'left-1'}`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════════
                    3. MEDIA & ASSETS TAB
                ══════════════════════════════════════════════════════════════ */}
                {activeTab === 'media' && (
                    <div className="bg-[#1A1428] border border-[#2E2542] p-6 rounded-3xl space-y-6 max-w-4xl">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-[#F5F2FA]">Local Media Library</h3>
                                <p className="text-[10px] text-[#8882A4] font-bold uppercase tracking-widest mt-0.5">Motion backgrounds, loops & static graphics</p>
                            </div>
                            <button
                                onClick={async () => {
                                    if (!window.electron?.Media?.import) return;
                                    const newFile = await window.electron.Media.import();
                                    if (newFile) {
                                        setMediaFiles(prev => [...prev, newFile]);
                                        triggerSaveFeedback();
                                    }
                                }}
                                className="flex items-center gap-2 text-xs bg-gradient-to-r from-[#A788FA] to-[#67E8F9] text-[#0B0814] px-5 py-2.5 rounded-full font-black uppercase hover:opacity-95 shadow-md shadow-purple-500/20 transition-all"
                            >
                                <PiUploadSimple size={16} /> + Import Media
                            </button>
                        </div>

                        {/* Media Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-64 overflow-y-auto pr-1">
                            {mediaFiles.map((url, i) => {
                                const isVideo = url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm');
                                const isSelected = styles.backgroundImage === url || styles.backgroundVideo === url;
                                return (
                                    <div
                                        key={i}
                                        className={`relative group aspect-video rounded-2xl overflow-hidden border transition-all ${
                                            isSelected ? 'border-[#A788FA] ring-2 ring-[#A788FA]/50 shadow-lg' : 'border-[#2E2542] hover:border-white/30'
                                        }`}
                                    >
                                        <button
                                            onClick={() => {
                                                updateStyles({
                                                    backgroundImage: isVideo ? null : url,
                                                    backgroundVideo: isVideo ? url : null,
                                                });
                                            }}
                                            className="w-full h-full block"
                                        >
                                            {isVideo ? (
                                                <video src={url} className="w-full h-full object-cover" />
                                            ) : (
                                                <img src={url} className="w-full h-full object-cover" alt="local" />
                                            )}
                                        </button>
                                        <div className="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.5 rounded text-[9px] font-mono text-white/80 uppercase">
                                            {isVideo ? 'Video' : 'Image'}
                                        </div>
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (window.electron?.Media?.delete) {
                                                    const ok = await window.electron.Media.delete(url);
                                                    if (ok) {
                                                        setMediaFiles(prev => prev.filter(f => f !== url));
                                                        if (isSelected) updateStyles({ backgroundImage: null, backgroundVideo: null });
                                                    }
                                                }
                                            }}
                                            className="absolute top-1.5 right-1.5 bg-red-600 text-white w-5 h-5 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 text-xs font-black shadow-md"
                                            title="Delete Media"
                                        >
                                            ×
                                        </button>
                                    </div>
                                );
                            })}
                            {mediaFiles.length === 0 && (
                                <div className="col-span-4 text-center py-10 text-[#8882A4] text-xs font-bold uppercase tracking-widest border border-dashed border-[#2E2542] rounded-2xl">
                                    No custom media imported yet. Click "+ Import Media" above.
                                </div>
                            )}
                        </div>

                        {/* Sample Backgrounds Preset */}
                        <div className="border-t border-[#2E2542] pt-5">
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest">
                                    Curated Sample Presets
                                </label>
                                {(styles.backgroundImage || styles.backgroundVideo) && (
                                    <button
                                        onClick={() => updateStyles({ backgroundImage: null, backgroundVideo: null })}
                                        className="text-[10px] text-red-400 hover:underline font-bold uppercase"
                                    >
                                        Clear Active Background
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[
                                    { title: "Neon Aurora", url: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=500&auto=format&fit=crop" },
                                    { title: "Sunset Glow", url: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=500&auto=format&fit=crop" },
                                    { title: "Deep Space", url: "https://images.unsplash.com/photo-1519681393798-38e43269d496?q=80&w=500&auto=format&fit=crop" },
                                    { title: "Holy Cross", url: "https://images.unsplash.com/photo-1438232992991-995b7058bbb3?q=80&w=500&auto=format&fit=crop" }
                                ].map((item, i) => (
                                    <button
                                        key={i}
                                        onClick={() => updateStyles({ backgroundImage: item.url, backgroundVideo: null })}
                                        className="aspect-video w-full rounded-2xl overflow-hidden border border-[#2E2542] hover:border-[#A788FA] transition-all relative group shadow-md"
                                    >
                                        <img src={item.url} className="w-full h-full object-cover" alt={item.title} />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="text-[10px] text-white font-black uppercase tracking-wider bg-black/60 px-3 py-1 rounded-full border border-white/20">
                                                Apply {item.title}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════════
                    4. BUMPERS (INTRO & OUTRO) TAB
                ══════════════════════════════════════════════════════════════ */}
                {activeTab === 'bumpers' && (
                    !canAccessBumpers ? (
                        <div className="max-w-4xl py-4">
                            <DisabledContainer
                                featureName="Broadcast Bumpers & Auto-Stitching"
                                description="Intro & Outro Bumpers and automatic recording stitching are available exclusively on Tier 2 (Standard, Large, or Premium) plans. Upgrade your subscription to enable broadcast bumpers."
                            >
                                <div className="p-8 text-center text-white/40">Bumpers configuration locked on current plan</div>
                            </DisabledContainer>
                        </div>
                    ) : (
                    <div className="space-y-6 max-w-4xl">
                        {/* Auto-Merge Master Switch */}
                        <div className="bg-[#1A1428] border border-[#2E2542] p-6 rounded-3xl shadow-lg">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                                        <h3 className="text-sm font-black uppercase tracking-widest text-[#F5F2FA]">
                                            Auto-Merge Recording Bumpers
                                        </h3>
                                    </div>
                                    <p className="text-xs text-[#8882A4] leading-relaxed max-w-2xl">
                                        When a timer or broadcast session ends, OCS will automatically stitch your custom
                                        Intro to the beginning and Outro to the end of the recording. The resulting archive
                                        in Sessions will be ready for immediate playback and publishing.
                                    </p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={bumpers.autoMerge !== false}
                                        onChange={(e) => handleToggleAutoMerge(e.target.checked)}
                                    />
                                    <div className="w-11 h-6 bg-[#2E2542] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#A788FA]"></div>
                                </label>
                            </div>
                        </div>

                        {bumperError && (
                            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center justify-between">
                                <span>{bumperError}</span>
                                <button onClick={() => setBumperError(null)} className="text-red-400 font-bold hover:underline">Dismiss</button>
                            </div>
                        )}

                        {/* Bumpers Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* INTRO BUMPER */}
                            <div className="bg-[#1A1428] border border-[#2E2542] rounded-3xl p-6 flex flex-col justify-between space-y-4">
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="px-3 py-1 rounded-full bg-[#A788FA]/20 text-[#A788FA] text-[10px] font-black uppercase tracking-wider">
                                            Intro (Beginning)
                                        </span>
                                        {bumpers.intro && (
                                            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                                                <PiCheckCircle size={14} /> Active
                                            </span>
                                        )}
                                    </div>
                                    <h4 className="text-base font-bold text-white mb-1">Session Intro Clip</h4>
                                    <p className="text-xs text-[#8882A4] mb-4">Plays before sermon or presentation recording begins.</p>

                                    {bumpers.intro ? (
                                        <div className="space-y-3">
                                            <div className="w-full bg-[#0B0814] rounded-2xl overflow-hidden border border-[#2E2542] aspect-video flex items-center justify-center">
                                                {bumpers.intro.hasVideo ? (
                                                    <video src={bumpers.intro.url} controls className="w-full h-full object-contain" />
                                                ) : (
                                                    <div className="p-6 flex flex-col items-center justify-center text-center gap-2 w-full">
                                                        <PiVideo size={36} className="text-[#A788FA]" />
                                                        <audio src={bumpers.intro.url} controls className="w-full mt-2" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between text-xs bg-[#0B0814]/70 p-3 rounded-2xl border border-[#2E2542]/60 font-mono">
                                                <span className="text-[#F5F2FA] truncate max-w-[160px]">{bumpers.intro.name}</span>
                                                <span className="text-[10px] text-[#8882A4]">
                                                    {formatBumperBytes(bumpers.intro.sizeBytes)} • {Math.round(bumpers.intro.durationSec || 0)}s
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="border-2 border-dashed border-[#2E2542] rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-2 bg-[#0B0814]/40">
                                            <PiFilmStrip size={28} className="text-[#8882A4]" />
                                            <p className="text-xs font-semibold text-[#F5F2FA]">No Intro Uploaded</p>
                                            <p className="text-[11px] text-[#8882A4]">Select MP4, MOV, WebM, or audio</p>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-3 pt-2">
                                    <button
                                        disabled={bumperBusy}
                                        onClick={() => handleUploadBumper('intro')}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#A788FA] text-[#0B0814] text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all disabled:opacity-50"
                                    >
                                        <PiUploadSimple size={16} /> {bumpers.intro ? 'Replace Intro' : 'Upload Intro'}
                                    </button>
                                    {bumpers.intro && (
                                        <button
                                            disabled={bumperBusy}
                                            onClick={() => handleRemoveBumper('intro')}
                                            className="px-4 py-3 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 text-xs font-bold transition-all disabled:opacity-50"
                                            title="Remove Intro"
                                        >
                                            <PiTrash size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* OUTRO BUMPER */}
                            <div className="bg-[#1A1428] border border-[#2E2542] rounded-3xl p-6 flex flex-col justify-between space-y-4">
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-wider">
                                            Outro (Ending)
                                        </span>
                                        {bumpers.outro && (
                                            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                                                <PiCheckCircle size={14} /> Active
                                            </span>
                                        )}
                                    </div>
                                    <h4 className="text-base font-bold text-white mb-1">Session Outro Clip</h4>
                                    <p className="text-xs text-[#8882A4] mb-4">Appended automatically when session finalize runs.</p>

                                    {bumpers.outro ? (
                                        <div className="space-y-3">
                                            <div className="w-full bg-[#0B0814] rounded-2xl overflow-hidden border border-[#2E2542] aspect-video flex items-center justify-center">
                                                {bumpers.outro.hasVideo ? (
                                                    <video src={bumpers.outro.url} controls className="w-full h-full object-contain" />
                                                ) : (
                                                    <div className="p-6 flex flex-col items-center justify-center text-center gap-2 w-full">
                                                        <PiVideo size={36} className="text-indigo-400" />
                                                        <audio src={bumpers.outro.url} controls className="w-full mt-2" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between text-xs bg-[#0B0814]/70 p-3 rounded-2xl border border-[#2E2542]/60 font-mono">
                                                <span className="text-[#F5F2FA] truncate max-w-[160px]">{bumpers.outro.name}</span>
                                                <span className="text-[10px] text-[#8882A4]">
                                                    {formatBumperBytes(bumpers.outro.sizeBytes)} • {Math.round(bumpers.outro.durationSec || 0)}s
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="border-2 border-dashed border-[#2E2542] rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-2 bg-[#0B0814]/40">
                                            <PiFilmStrip size={28} className="text-[#8882A4]" />
                                            <p className="text-xs font-semibold text-[#F5F2FA]">No Outro Uploaded</p>
                                            <p className="text-[11px] text-[#8882A4]">Select MP4, MOV, WebM, or audio</p>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-3 pt-2">
                                    <button
                                        disabled={bumperBusy}
                                        onClick={() => handleUploadBumper('outro')}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#A788FA] text-[#0B0814] text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all disabled:opacity-50"
                                    >
                                        <PiUploadSimple size={16} /> {bumpers.outro ? 'Replace Outro' : 'Upload Outro'}
                                    </button>
                                    {bumpers.outro && (
                                        <button
                                            disabled={bumperBusy}
                                            onClick={() => handleRemoveBumper('outro')}
                                            className="px-4 py-3 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 text-xs font-bold transition-all disabled:opacity-50"
                                            title="Remove Outro"
                                        >
                                            <PiTrash size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    )
                )}

                {/* ══════════════════════════════════════════════════════════════
                    5. VOICE, ASR & AI TAB
                ══════════════════════════════════════════════════════════════ */}
                {activeTab === 'voice' && (
                    <div className="bg-[#1A1428] border border-[#2E2542] p-6 rounded-3xl space-y-6 max-w-4xl">
                        {/* ASR Engine Status Badge */}
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-[#0B0814] border border-[#2E2542]">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center text-[#A788FA]">
                                    <PiCpu size={20} />
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-[#F5F2FA]">Active Speech Recognition Engine</h4>
                                    <p className="text-[10px] text-[#8882A4]">
                                        {asrStatus?.engine ? `Engine: ${asrStatus.engine}` : 'Native whisper.cpp with Vosk fallback'}
                                    </p>
                                </div>
                            </div>
                            <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold">
                                {asrStatus?.running ? 'RUNNING' : 'ONLINE'}
                            </span>
                        </div>

                        {/* Transcription Language */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-black uppercase tracking-widest text-[#F5F2FA]">Target Transcription Language</h3>
                            <p className="text-xs text-[#8882A4] leading-relaxed">
                                OCS transcribes only the selected language. When an interpreter speaks another language
                                on the same microphone, those chunks are automatically filtered out (whisper language detection per VAD segment).
                            </p>
                            <select
                                value={transcriptionLanguage}
                                onChange={(e) => setTranscriptionLang(e.target.value)}
                                className="w-full bg-[#0B0814] border border-[#2E2542] rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-[#A788FA]"
                            >
                                {[
                                    { id: 'en', label: 'English (Default)' },
                                    { id: 'yo', label: 'Yoruba (Nigeria)' },
                                    { id: 'fr', label: 'French' },
                                    { id: 'es', label: 'Spanish' },
                                    { id: 'pt', label: 'Portuguese' },
                                    { id: 'sw', label: 'Swahili' },
                                    { id: 'ha', label: 'Hausa' },
                                    { id: 'ig', label: 'Igbo' },
                                    { id: 'de', label: 'German' },
                                    { id: 'zh', label: 'Chinese (Mandarin)' },
                                    { id: 'ar', label: 'Arabic' },
                                ].map((opt) => (
                                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                                ))}
                            </select>

                            <label className="flex items-start gap-3 cursor-pointer pt-2">
                                <input
                                    type="checkbox"
                                    className="mt-1 accent-[#A788FA] w-4 h-4 rounded"
                                    checked={languageGateEnabled}
                                    onChange={(e) => setLanguageGate(e.target.checked)}
                                />
                                <span>
                                    <span className="text-sm text-[#F5F2FA] font-semibold block">Filter non-target languages</span>
                                    <span className="text-[11px] text-[#8882A4]">
                                        Skip interpreter / other-language audio segments. Applies to primary mic and secondary push-to-talk.
                                    </span>
                                </span>
                            </label>
                        </div>

                        {/* Transcript Correction Features */}
                        <div className="border-t border-[#2E2542] pt-5 space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-widest text-[#F5F2FA]">Transcript AI & Cleanup</h3>
                            
                            <label className="flex items-start gap-3 cursor-pointer p-4 rounded-2xl bg-[#0B0814] border border-[#2E2542] hover:border-white/20 transition-colors">
                                <input
                                    type="checkbox"
                                    className="mt-1 accent-[#A788FA] w-4 h-4 rounded"
                                    checked={liveTranscriptCorrection}
                                    onChange={(e) => setLiveCorrection(e.target.checked)}
                                />
                                <div className="space-y-0.5">
                                    <span className="text-sm text-[#F5F2FA] font-semibold block">Tier 1: Correct Live Transcript (Dictionary)</span>
                                    <span className="text-xs text-[#8882A4] block">Fast display-only cleanup of biblical names, places, and church vocabulary in real-time.</span>
                                </div>
                            </label>

                            <label className="flex items-start gap-3 cursor-pointer p-4 rounded-2xl bg-[#0B0814] border border-[#2E2542] hover:border-white/20 transition-colors">
                                <input
                                    type="checkbox"
                                    className="mt-1 accent-[#A788FA] w-4 h-4 rounded"
                                    checked={sessionTranscriptCleanup}
                                    onChange={(e) => setSessionCleanup(e.target.checked)}
                                />
                                <div className="space-y-0.5">
                                    <span className="text-sm text-[#F5F2FA] font-semibold block">Tier 2: Clean Session PDF Transcript (Local Ollama AI)</span>
                                    <span className="text-xs text-[#8882A4] block">Post-timer Ollama LLM pass before PDF compilation. The raw transcript is always preserved.</span>
                                </div>
                            </label>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════════
                    6. SYSTEM & LICENSE TAB
                ══════════════════════════════════════════════════════════════ */}
                {activeTab === 'system' && (
                    <div className="space-y-6 max-w-4xl">
                        {/* Display Sleep Prevention */}
                        <div className="bg-[#1A1428] border border-[#2E2542] p-6 rounded-3xl space-y-4">
                            <div className="flex items-center gap-2">
                                <PiMoon className="text-[#A788FA]" size={20} />
                                <h3 className="text-sm font-black uppercase tracking-widest text-[#F5F2FA]">Display Sleep Prevention</h3>
                            </div>
                            <p className="text-xs text-[#8882A4] leading-relaxed">
                                Keeps monitors, beamers, and projectors awake while OCS is active.
                                "Always" prevents macOS/Windows screensavers and sleep timers completely.
                            </p>
                            {!sleepProbeOk && (
                                <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 p-3 text-xs text-amber-200 flex items-center gap-2">
                                    <PiWarning size={16} /> Display sleep prevention could not be verified by hardware probe.
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { id: 'always', label: 'Always Awake (Recommended)' },
                                    { id: 'live', label: 'Only While Live Timer Running' },
                                ].map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setSleepPreventionMode(opt.id)}
                                        className={`px-4 py-3 rounded-2xl text-xs font-bold border transition-all text-center ${
                                            sleepMode === opt.id
                                                ? 'bg-[#A788FA]/20 border-[#A788FA] text-[#A788FA] shadow-md'
                                                : 'bg-transparent border-[#2E2542] text-[#8882A4] hover:border-white/20 hover:text-white'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* OCS Service at System Startup */}
                        <div className="bg-[#1A1428] border border-[#2E2542] p-6 rounded-3xl space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <PiPower className="text-[#38BDF8]" size={20} />
                                    <h3 className="text-sm font-black uppercase tracking-widest text-[#F5F2FA]">OCS Service Startup</h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={toggleStartAtLogin}
                                    className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
                                        startAtLogin ? 'bg-[#38BDF8]' : 'bg-[#2E2542]'
                                    }`}
                                >
                                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                                        startAtLogin ? 'translate-x-6' : 'translate-x-0'
                                    }`} />
                                </button>
                            </div>
                            <p className="text-xs text-[#8882A4] leading-relaxed">
                                Automatically launches the OCS Presentation, Remote, and ASR service on workstation boot / login, ensuring projection screens and companion remotes are ready for service without manual start.
                            </p>
                        </div>

                        {/* Workstation License & Subscription Details */}
                        {authContext && (() => {
                            const planInfo = formatPlanDetails(
                                authContext.auth?.subscriptionPlan || authContext.auth?.licenseTier,
                                authContext.auth?.daysRemaining,
                                {
                                    isAuthenticated: authContext.isAuthenticated,
                                    guestExpired: authContext.guestExpired,
                                    guestRemainingMinutes: authContext.guestRemainingMinutes,
                                }
                            );
                            return (
                                <div className="bg-[#1A1428] border border-[#2E2542] p-6 rounded-3xl space-y-5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <PiShieldCheck className="text-[#67E8F9]" size={22} />
                                            <div>
                                                <h3 className="text-sm font-black uppercase tracking-widest text-[#F5F2FA]">Subscription & License</h3>
                                                <p className="text-[11px] text-[#8882A4]">Workstation entitlements and subscription status</p>
                                            </div>
                                        </div>
                                        <span className={"px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider " + (
                                            authContext.isAuthenticated
                                                ? (authContext.isGracePeriod ? "bg-amber-500/15 border border-amber-500/30 text-amber-300" : "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300")
                                                : (authContext.guestExpired ? "bg-rose-500/20 border border-rose-500/40 text-rose-300 animate-pulse" : "bg-amber-500/15 border border-amber-500/30 text-amber-300")
                                        )}>
                                            {authContext.isAuthenticated ? (authContext.isGracePeriod ? "Offline Grace" : "Active License") : (authContext.guestExpired ? "Guest Expired (Locked)" : "1-Hr Guest Trial")}
                                        </span>
                                    </div>

                                    {/* Primary Plan & Days Remaining Card */}
                                    <div className="p-4 rounded-2xl bg-gradient-to-r from-[#211838] to-[#161028] border border-[#3E3259] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                        <div>
                                            <span className="text-[10px] font-black tracking-widest uppercase text-[#A788FA] block mb-1">Current Subscription Plan</span>
                                            <div className="text-base font-black text-white">
                                                {planInfo.name}
                                            </div>
                                        </div>
                                        <div className="sm:text-right">
                                            <span className="text-[10px] font-black tracking-widest uppercase text-[#8882A4] block mb-1">
                                                {authContext.isAuthenticated ? "Days Remaining" : "Guest Time Remaining"}
                                            </span>
                                            <div className={"text-sm font-black " + planInfo.daysColor}>
                                                {planInfo.daysLabel}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 rounded-2xl bg-[#0B0814] border border-[#2E2542] text-xs">
                                        <div>
                                            <span className="text-[#8882A4] block text-[10px] font-bold uppercase">Church Organization</span>
                                            <span className="text-white font-bold">{authContext.auth?.orgName || (authContext.isAuthenticated ? "OCS Community Church" : "Unregistered Guest")}</span>
                                        </div>
                                        <div>
                                            <span className="text-[#8882A4] block text-[10px] font-bold uppercase">Account Email</span>
                                            <span className="text-white font-mono">{authContext.auth?.email || (authContext.isAuthenticated ? "operator@churchocs.com" : "Not Logged In")}</span>
                                        </div>
                                        <div>
                                            <span className="text-[#8882A4] block text-[10px] font-bold uppercase">Plan Tier Code</span>
                                            <span className="text-[#A788FA] font-black uppercase">
                                                {authContext.isAuthenticated ? (authContext.auth?.subscriptionPlan || authContext.auth?.licenseTier || "trial") : (authContext.guestExpired ? "GUEST_EXPIRED" : "GUEST_TRIAL_1HR")}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[#8882A4] block text-[10px] font-bold uppercase">Workstation Status</span>
                                            <span className={authContext.isAuthenticated ? "text-emerald-400 font-bold" : (authContext.guestExpired ? "text-rose-400 font-bold" : "text-amber-400 font-bold")}>
                                                {authContext.isAuthenticated
                                                    ? (authContext.auth?.hoursRemaining != null ? (authContext.auth.hoursRemaining + "h remaining") : "72h Max Grace Period")
                                                    : (authContext.guestExpired ? "Locked (Log In Required)" : `${authContext.guestRemainingMinutes}m Guest Session`)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 pt-1">
                                        {!authContext.isAuthenticated ? (
                                            <button
                                                onClick={() => authContext.login()}
                                                className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-purple-900/30"
                                            >
                                                Log In to Activate 60-Day Free Trial
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => authContext.login()}
                                                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-bold transition-colors"
                                                >
                                                    Manage / Refresh Plan
                                                </button>
                                                <button
                                                    onClick={() => authContext.logout()}
                                                    className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 text-xs font-bold transition-colors"
                                                >
                                                    Log Out
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* OCS Desktop Version & Updates */}
                        <div className="bg-[#1A1428] border border-[#2E2542] p-6 rounded-3xl space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <PiSparkle className="text-[#A788FA]" size={22} />
                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-widest text-[#F5F2FA]">Application Updates & Release</h3>
                                        <p className="text-[11px] text-[#8882A4]">Automatic update channel and version management</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/5 border border-white/10 text-white">
                                        v{updater.currentVersion}
                                    </span>
                                    <span className={"px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider " + (
                                        updater.status === 'downloaded'
                                            ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 animate-pulse"
                                            : updater.status === 'available'
                                                ? "bg-[#A788FA]/20 border border-[#A788FA]/40 text-[#A788FA]"
                                                : updater.status === 'downloading'
                                                    ? "bg-sky-500/15 border border-sky-500/30 text-sky-300"
                                                    : updater.status === 'checking'
                                                        ? "bg-amber-500/15 border border-amber-500/30 text-amber-300"
                                                        : "bg-[#231A36] border border-[#2E2542] text-[#8882A4]"
                                    )}>
                                        {updater.status === 'downloaded' ? 'Ready to Install' :
                                         updater.status === 'available' ? `v${updater.updateInfo?.version || ''} Available` :
                                         updater.status === 'downloading' ? `Downloading ${updater.downloadProgress?.percent || 0}%` :
                                         updater.status === 'checking' ? 'Checking...' :
                                         updater.status === 'error' ? 'Check Failed' : 'Up to Date'}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 bg-[#140F20] p-4 rounded-2xl border border-[#261E38] text-xs">
                                <div>
                                    <span className="text-[#8882A4] block text-[10px] font-bold uppercase">Installed Version</span>
                                    <span className="text-white font-bold">OCS v{updater.currentVersion}</span>
                                </div>
                                <div>
                                    <span className="text-[#8882A4] block text-[10px] font-bold uppercase">Update Channel</span>
                                    <span className="text-[#A788FA] font-bold uppercase">GitHub Releases (Stable)</span>
                                </div>
                            </div>

                            {/* Update Action Controls */}
                            <div className="flex flex-wrap items-center gap-3 pt-1">
                                {updater.status === 'available' ? (
                                    <button
                                        type="button"
                                        onClick={() => updater.downloadUpdate()}
                                        className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#A788FA] to-[#818cf8] hover:from-[#9570f5] hover:to-[#6366f1] text-[#0B0814] text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-purple-500/25 flex items-center gap-2"
                                    >
                                        <PiDownloadSimple size={16} />
                                        <span>Download Update (v{updater.updateInfo?.version})</span>
                                    </button>
                                ) : updater.status === 'downloaded' ? (
                                    <button
                                        type="button"
                                        onClick={() => updater.quitAndInstall()}
                                        className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-[#0B0814] text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/25 flex items-center gap-2"
                                    >
                                        <PiCheckCircle size={16} />
                                        <span>Restart & Install Update</span>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={updater.status === 'checking' || updater.status === 'downloading'}
                                        onClick={() => updater.checkForUpdates(true)}
                                        className="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-bold transition-all flex items-center gap-2"
                                    >
                                        <PiArrowClockwise size={15} className={updater.status === 'checking' ? 'animate-spin' : ''} />
                                        <span>{updater.status === 'checking' ? 'Checking for updates...' : 'Check for Updates'}</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Factory Reset */}
                        <div className="bg-[#1A1428] border border-red-500/20 p-6 rounded-3xl space-y-3">
                            <h3 className="text-sm font-black uppercase tracking-widest text-red-300">Factory Reset Configuration</h3>
                            <p className="text-xs text-[#8882A4]">
                                Restores all display styles, scripture alignments, bumper paths, and audio preferences to their default states.
                            </p>
                            <button
                                onClick={() => setShowResetModal(true)}
                                className="px-5 py-2.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-bold transition-colors"
                            >
                                Reset All Settings to Factory Defaults
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ─── Reset Confirmation Modal ─── */}
            {showResetModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-[#161028] border border-[#2E2542] rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-amber-400">
                                <PiWarning size={22} />
                                <h3 className="text-base font-black text-white">Confirm Factory Reset</h3>
                            </div>
                            <button onClick={() => setShowResetModal(false)} className="text-[#8882A4] hover:text-white">
                                <PiX size={20} />
                            </button>
                        </div>
                        <p className="text-xs text-[#C8C2DC] leading-relaxed">
                            Are you sure you want to reset all display styles and application preferences? This will restore background colors, typography, and ASR settings to factory defaults.
                        </p>
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setShowResetModal(false)}
                                className="flex-1 px-4 py-2.5 rounded-2xl bg-white/10 text-white text-xs font-bold hover:bg-white/15 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleResetToDefaults}
                                className="flex-1 px-4 py-2.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider transition-colors shadow-lg shadow-red-600/30"
                            >
                                Reset Now
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
