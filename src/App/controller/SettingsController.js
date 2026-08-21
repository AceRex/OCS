import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

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
    PiBroadcast,
    PiCopy,
    PiCheck,
    PiWarning,
    PiShieldWarning,
    PiShieldCheck,
    PiSignOut,
    PiUserCheck,
} from "react-icons/pi";

const TRANSLATIONS = ['KJV', 'NIV', 'ESV', 'NKJV', 'NLT', 'AMP', 'MSG', 'CSB', 'NASB', 'RSV'];

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

function formatBumperBytes(n) {
    if (!n || n < 1024) return `${n || 0} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SettingsController() {
    const [activeTab, setActiveTab] = useState('appearance');

    const [styles, setStyles] = useState({
        bgType: "color",
        backgroundColor: "#0B0814",
        textColor: "#F5F2FA",
        fontFamily: "Outfit",
        fontSize: "5rem",
        textAlign: "center",
        backgroundImage: null,
        backgroundVideo: null,
        // Bible settings
        bibleRefPosition: "top-center",
        bibleBodyPosition: "center",
        bibleTranslation: "KJV",
        bibleServiceLabel: "",
        bibleShowOrbs: true,
    });

    const [mediaFiles, setMediaFiles] = useState([]);
    const [sleepMode, setSleepMode] = useState('always');
    const [sleepProbeOk, setSleepProbeOk] = useState(true);
    const [liveTranscriptCorrection, setLiveTranscriptCorrection] = useState(false);
    const [sessionTranscriptCleanup, setSessionTranscriptCleanup] = useState(false);
    const [scriptureReadAlong, setScriptureReadAlong] = useState(true);
    const [transcriptionLanguage, setTranscriptionLanguage] = useState('en');
    const [languageGateEnabled, setLanguageGateEnabled] = useState(true);

    // Bumpers state (Intro / Outro)
    const [bumpers, setBumpers] = useState({ intro: null, outro: null, autoMerge: true });
    const [bumperBusy, setBumperBusy] = useState(false);
    const [bumperError, setBumperError] = useState(null);

    // NDI state (FR-4.42, FR-4.43)
    const [ndiConfig, setNdiConfig] = useState({ enabled: false, resolution: '1080p', fps: 30 });
    const [ndiStatus, setNdiStatus] = useState(null);
    const [showNdiConsentModal, setShowNdiConsentModal] = useState(false);
    const [copiedUrl, setCopiedUrl] = useState(null);

    // Auth & License state — from shared AuthContext (FR-13.1, FR-13.5, FR-13.6)
    const { auth: authStatus, logout: authLogout, isAuthenticated } = useAuth();
    const [authLoading, setAuthLoading] = useState(false);

    useEffect(() => {
        const loadSettings = async () => {
            if (window.electron?.Settings?.get) {
                const s = await window.electron.Settings.get();
                if (s?.sleepPrevention) setSleepMode(s.sleepPrevention);
                setLiveTranscriptCorrection(!!s?.liveTranscriptCorrection);
                setSessionTranscriptCleanup(!!s?.sessionTranscriptCleanup);
                setScriptureReadAlong(s?.scriptureReadAlong !== false);
                setTranscriptionLanguage(s?.transcriptionLanguage || 'en');
                setLanguageGateEnabled(s?.languageGateEnabled !== false);
            }
            if (window.electron?.Sleep?.probe) {
                const p = await window.electron.Sleep.probe();
                setSleepProbeOk(!!p?.ok);
            }
            if (window.electron?.Bumper?.get) {
                try {
                    const b = await window.electron.Bumper.get();
                    if (b) setBumpers(b);
                } catch (_) {}
            }
            if (window.electron?.Ndi?.getStatus) {
                try {
                    const status = await window.electron.Ndi.getStatus();
                    if (status) {
                        setNdiStatus(status);
                        setNdiConfig((prev) => ({
                            ...prev,
                            enabled: !!status.enabled,
                            resolution: status.resolution || '1080p',
                            fps: status.fps || 30,
                        }));
                    }
                } catch (_) {}
            }
        };
        loadSettings();

        const unsubNdi = window.electron?.Ndi?.onStatusUpdate?.((status) => {
            if (status) {
                setNdiStatus(status);
                setNdiConfig((prev) => ({ ...prev, enabled: !!status.enabled }));
            }
        });

        return () => {
            unsubNdi?.();
        };
    }, []);

    const handleLogout = async () => {
        if (window.confirm("Log out of this workstation?\n\nYou will need active internet connectivity to sign back in.")) {
            setAuthLoading(true);
            try {
                await authLogout();
            } catch (err) {
                console.error("Logout failed:", err);
            } finally {
                setAuthLoading(false);
            }
        }
    };

    const handleUploadBumper = async (type) => {
        setBumperBusy(true);
        setBumperError(null);
        try {
            const res = await window.electron?.Bumper?.upload?.(type);
            if (res) {
                setBumpers((prev) => ({ ...prev, [type]: res }));
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
    };

    const setLiveCorrection = async (on) => {
        setLiveTranscriptCorrection(on);
        if (window.electron?.Settings?.set) {
            await window.electron.Settings.set({ liveTranscriptCorrection: !!on });
        }
    };

    const setSessionCleanup = async (on) => {
        setSessionTranscriptCleanup(on);
        if (window.electron?.Settings?.set) {
            await window.electron.Settings.set({ sessionTranscriptCleanup: !!on });
        }
    };

    const setReadAlong = async (on) => {
        setScriptureReadAlong(on);
        if (window.electron?.Settings?.set) {
            await window.electron.Settings.set({ scriptureReadAlong: !!on });
        }
    };

    const setTranscriptionLang = async (code) => {
        setTranscriptionLanguage(code);
        if (window.electron?.Settings?.set) {
            await window.electron.Settings.set({ transcriptionLanguage: code });
        }
    };

    const setLanguageGate = async (on) => {
        setLanguageGateEnabled(on);
        if (window.electron?.Settings?.set) {
            await window.electron.Settings.set({ languageGateEnabled: !!on });
        }
    };

    const applyNdiState = async (enabled) => {
        try {
            const updated = await window.electron?.Ndi?.setConfig?.({ enabled });
            if (updated) {
                setNdiStatus(updated);
                setNdiConfig((prev) => ({ ...prev, enabled: !!updated.enabled }));
            }
        } catch (err) {
            console.error("Failed to update NDI state:", err);
        }
    };

    const handleToggleNdi = (wantsEnable) => {
        if (wantsEnable) {
            // FR-4.43: Plain-language exposure notice required before enabling
            setShowNdiConsentModal(true);
        } else {
            applyNdiState(false);
        }
    };

    const copyToClipboard = (text, key) => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
            setCopiedUrl(key);
            setTimeout(() => setCopiedUrl(null), 2000);
        }
    };

    useEffect(() => {
        const loadMedia = async () => {
            if (window.electron?.Media?.list) {
                const files = await window.electron.Media.list();
                if (Array.isArray(files)) setMediaFiles(files);
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

        return () => {
            unsubMedia?.();
            unsubBumpers?.();
        };
    }, []);

    const updateStyle = (key, value) => {
        const newStyles = { ...styles, [key]: value };
        setStyles(newStyles);
        if (window.electron?.Presentation?.setStyle) {
            window.electron.Presentation.setStyle(newStyles);
        }
    };

    const tabs = [
        { id: 'appearance', label: 'Appearance', icon: <PiPalette /> },
        { id: 'scripture', label: 'Scripture', icon: <PiBook /> },
        { id: 'media', label: 'Media', icon: <PiPaintBucket /> },
        { id: 'bumpers', label: 'Intro & Outro', icon: <PiFilmStrip /> },
        { id: 'privacy', label: 'Privacy & AI', icon: <PiMicrophone /> },
        { id: 'ndi', label: 'NDI & Broadcast', icon: <PiBroadcast /> },
        { id: 'license', label: 'License & Auth', icon: <PiShieldCheck /> },
    ];

    return (
        <div className="flex flex-col gap-0 text-white h-full overflow-hidden font-outfit bg-[#0B0814]"
             style={{ fontFamily: "'Outfit', 'Space Grotesk', sans-serif" }}>
            {/* Header */}
            <div className="px-8 pt-8 pb-6 border-b border-[#2E2542]">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-2xl bg-violet/20 flex items-center justify-center text-[#A788FA]">
                        <PiGear size={22} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-widest text-[#F5F2FA]">Settings</h2>
                        <p className="text-[10px] text-[#8882A4] font-bold uppercase tracking-widest">OCS Broadcast Configuration</p>
                    </div>
                </div>
                {/* Tab Bar */}
                <div className="flex gap-2">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
                                activeTab === tab.id
                                    ? 'bg-[#A788FA] text-[#0B0814]'
                                    : 'bg-[#1A1428] text-[#8882A4] hover:text-white hover:bg-[#231A36]'
                            }`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar">

                {/* ─── APPEARANCE TAB ─── */}
                {activeTab === 'appearance' && (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-[#1A1428] border border-[#2E2542] p-5 rounded-3xl flex flex-col gap-3">
                                <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest flex items-center gap-2">
                                    <PiPaintBucket /> Background Color
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={styles.backgroundColor}
                                        onChange={(e) => updateStyle("backgroundColor", e.target.value)}
                                        className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-none"
                                    />
                                    <span className="text-xs font-mono text-[#8882A4]">{styles.backgroundColor}</span>
                                </div>
                            </div>

                            <div className="bg-[#1A1428] border border-[#2E2542] p-5 rounded-3xl flex flex-col gap-3">
                                <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest flex items-center gap-2">
                                    <PiTextT /> Text Color
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={styles.textColor}
                                        onChange={(e) => updateStyle("textColor", e.target.value)}
                                        className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-none"
                                    />
                                    <span className="text-xs font-mono text-[#8882A4]">{styles.textColor}</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-[#1A1428] border border-[#2E2542] p-5 rounded-3xl flex flex-col gap-3">
                            <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest">Display Font</label>
                            <div className="grid grid-cols-3 gap-2">
                                {['Outfit', 'Space Grotesk', 'Georgia', 'Arial', 'Courier New', 'Times New Roman'].map(font => (
                                    <button
                                        key={font}
                                        onClick={() => updateStyle('fontFamily', font)}
                                        className={`px-4 py-2.5 rounded-2xl text-xs font-bold border transition-all ${
                                            styles.fontFamily === font
                                                ? 'bg-[#A788FA]/20 border-[#A788FA] text-[#A788FA]'
                                                : 'bg-transparent border-[#2E2542] text-[#8882A4] hover:border-white/20 hover:text-white'
                                        }`}
                                        style={{ fontFamily: font }}
                                    >
                                        {font}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {/* ─── SCRIPTURE TAB ─── */}
                {activeTab === 'scripture' && (
                    <>
                        {/* Preview Swatch */}
                        <div className="w-full rounded-3xl overflow-hidden border border-[#2E2542]" style={{ aspectRatio: '16/9', position: 'relative', backgroundColor: '#0B0814' }}>
                            {/* Orbs preview */}
                            {styles.bibleShowOrbs && (
                                <>
                                    <div style={{ position:'absolute', top:'-15%', left:'-15%', width:'55%', height:'55%', borderRadius:'50%', background:'radial-gradient(circle, rgba(167,136,250,0.55) 0%, rgba(167,136,250,0.12) 55%, transparent 70%)', filter:'blur(2px)' }} />
                                    <div style={{ position:'absolute', bottom:'-15%', right:'-15%', width:'50%', height:'50%', borderRadius:'50%', background:'radial-gradient(circle, rgba(103,232,249,0.45) 0%, rgba(103,232,249,0.10) 55%, transparent 70%)', filter:'blur(2px)' }} />
                                </>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div style={{ textAlign:'center', padding:'5%' }}>
                                    <p style={{ fontFamily:'"JetBrains Mono", monospace', fontSize:'1.2vw', color:'#67E8F9', letterSpacing:'0.2em', textTransform:'uppercase', marginBottom:'4%' }}>
                                        JOHN · <span style={{ color:'#A788FA' }}>CHAPTER 3 · VERSE 16</span>
                                    </p>
                                    <p style={{ fontFamily:'"Outfit", sans-serif', fontSize:'2.2vw', fontWeight:800, color:'#F5F2FA', lineHeight:1.15 }}>
                                        "For God so loved the world that he gave his one and only Son"
                                    </p>
                                </div>
                            </div>
                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                                <span style={{ fontFamily:'"Outfit", sans-serif', fontSize:'0.9vw', color:'rgba(245,242,250,0.4)', letterSpacing:'0.15em', textTransform:'uppercase' }}>
                                    {styles.bibleTranslation}{styles.bibleServiceLabel ? ` · ${styles.bibleServiceLabel}` : ''}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Translation */}
                            <div className="bg-[#1A1428] border border-[#2E2542] p-5 rounded-3xl flex flex-col gap-3">
                                <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest flex items-center gap-2">
                                    <PiTranslate /> Translation
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {TRANSLATIONS.map(t => (
                                        <button
                                            key={t}
                                            onClick={() => updateStyle('bibleTranslation', t)}
                                            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                                styles.bibleTranslation === t
                                                    ? 'bg-[#67E8F9]/20 border-[#67E8F9] text-[#67E8F9]'
                                                    : 'bg-transparent border-[#2E2542] text-[#8882A4] hover:border-white/20 hover:text-white'
                                            }`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Service Label */}
                            <div className="bg-[#1A1428] border border-[#2E2542] p-5 rounded-3xl flex flex-col gap-3">
                                <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest">Service Label</label>
                                <input
                                    type="text"
                                    value={styles.bibleServiceLabel}
                                    onChange={(e) => updateStyle('bibleServiceLabel', e.target.value)}
                                    placeholder="e.g. Sunday Service"
                                    className="bg-[#0B0814] border border-[#2E2542] rounded-2xl px-4 py-3 text-sm text-white placeholder-[#2E2542] outline-none focus:border-[#A788FA] transition-colors"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Reference Position */}
                            <div className="bg-[#1A1428] border border-[#2E2542] p-5 rounded-3xl flex flex-col gap-3">
                                <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest flex items-center gap-2">
                                    <PiArrowsOut /> Book & Verse Position
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {REF_POSITIONS.map(pos => (
                                        <button
                                            key={pos.value}
                                            onClick={() => updateStyle('bibleRefPosition', pos.value)}
                                            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                                                styles.bibleRefPosition === pos.value
                                                    ? 'bg-[#A788FA]/20 border-[#A788FA] text-[#A788FA]'
                                                    : 'bg-transparent border-[#2E2542] text-[#8882A4] hover:border-white/20 hover:text-white'
                                            }`}
                                        >
                                            {pos.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Body Position */}
                            <div className="bg-[#1A1428] border border-[#2E2542] p-5 rounded-3xl flex flex-col gap-3">
                                <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest">Scripture Body Position</label>
                                <div className="flex flex-col gap-2">
                                    {BODY_POSITIONS.map(pos => (
                                        <button
                                            key={pos.value}
                                            onClick={() => updateStyle('bibleBodyPosition', pos.value)}
                                            className={`px-4 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest border text-left transition-all ${
                                                styles.bibleBodyPosition === pos.value
                                                    ? 'bg-[#A788FA]/20 border-[#A788FA] text-[#A788FA]'
                                                    : 'bg-transparent border-[#2E2542] text-[#8882A4] hover:border-white/20 hover:text-white'
                                            }`}
                                        >
                                            {pos.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="mt-2 pt-4 border-t border-[#2E2542] flex items-center justify-between">
                                    <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest">Show Orb Effects</label>
                                    <button
                                        onClick={() => updateStyle('bibleShowOrbs', !styles.bibleShowOrbs)}
                                        className={`relative w-12 h-6 rounded-full transition-colors ${styles.bibleShowOrbs ? 'bg-[#A788FA]' : 'bg-[#2E2542]'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${styles.bibleShowOrbs ? 'left-7' : 'left-1'}`} />
                                    </button>
                                </div>
                                <div className="mt-2 pt-4 border-t border-[#2E2542] flex items-center justify-between gap-3">
                                    <div>
                                        <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest block">Scripture read-along (Speaker)</label>
                                        <span className="text-[10px] text-[#8882A4]">Word-pop teleprompt on Speaker View & Mini Preview. General View stays clean.</span>
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
                    </>
                )}

                {/* ─── MEDIA TAB ─── */}
                {activeTab === 'media' && (
                    <div className="bg-[#1A1428] border border-[#2E2542] p-5 rounded-3xl flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest">Media Library</label>
                            <button
                                onClick={async () => {
                                    if (!window.electron?.Media?.import) return;
                                    const newFile = await window.electron.Media.import();
                                    if (newFile) setMediaFiles(prev => [...prev, newFile]);
                                }}
                                className="text-[10px] bg-[#A788FA] text-[#0B0814] px-4 py-1.5 rounded-full font-black uppercase hover:bg-[#67E8F9] transition-colors"
                            >
                                + Import
                            </button>
                        </div>

                        <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                            {mediaFiles.map((url, i) => {
                                const isVideo = url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm');
                                return (
                                    <div key={i} className="relative group aspect-video rounded-2xl overflow-hidden border border-[#2E2542] hover:border-[#A788FA] transition-all">
                                        <button
                                            onClick={() => {
                                                const newStyles = { ...styles, backgroundImage: isVideo ? null : url, backgroundVideo: isVideo ? url : null };
                                                setStyles(newStyles);
                                                if (window.electron?.Presentation?.setStyle) window.electron.Presentation.setStyle(newStyles);
                                            }}
                                            className="w-full h-full"
                                        >
                                            {isVideo ? <video src={url} className="w-full h-full object-cover" /> : <img src={url} className="w-full h-full object-cover" alt="local" />}
                                        </button>
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (window.electron?.Media?.delete) {
                                                    const ok = await window.electron.Media.delete(url);
                                                    if (ok) setMediaFiles(prev => prev.filter(f => f !== url));
                                                }
                                            }}
                                            className="absolute top-1 right-1 bg-red-600 text-white w-4 h-4 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 text-[10px] font-black"
                                        >×</button>
                                    </div>
                                );
                            })}
                            {mediaFiles.length === 0 && (
                                <div className="col-span-4 text-center py-8 text-[#8882A4] text-xs font-bold uppercase tracking-widest opacity-40">
                                    No media imported yet
                                </div>
                            )}
                        </div>

                        <div className="border-t border-[#2E2542] pt-4">
                            <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest mb-3 block">Sample Backgrounds</label>
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=500&auto=format&fit=crop",
                                    "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=500&auto=format&fit=crop",
                                    "https://images.unsplash.com/photo-1519681393798-38e43269d496?q=80&w=500&auto=format&fit=crop",
                                    "https://images.unsplash.com/photo-1438232992991-995b7058bbb3?q=80&w=500&auto=format&fit=crop"
                                ].map((url, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            const newStyles = { ...styles, backgroundImage: url, backgroundVideo: null };
                                            setStyles(newStyles);
                                            if (window.electron?.Presentation?.setStyle) window.electron.Presentation.setStyle(newStyles);
                                        }}
                                        className="aspect-video w-full rounded-2xl overflow-hidden border border-[#2E2542] hover:border-[#A788FA] transition-all relative group"
                                    >
                                        <img src={url} className="w-full h-full object-cover" alt="sample" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="text-[10px] text-white font-black uppercase">Use</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── PRIVACY / SESSION ARCHIVE ─── */}
                {activeTab === 'privacy' && (
                    <div className="bg-[#1A1428] border border-[#2E2542] p-6 rounded-3xl flex flex-col gap-4 max-w-2xl">
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-widest text-[#F5F2FA]">Session archive</h3>
                            <p className="text-[10px] text-[#8882A4] font-bold uppercase tracking-widest mt-1">Local recording notice</p>
                        </div>
                        <p className="text-sm text-[#C8C2DC] leading-relaxed">
                            When you start a service timer, OCS may record microphone audio and the live transcript
                            into a local Session Folder for church archive (sermon review, podcasts, notes).
                            Audio and transcripts stay on this computer under the app’s data folder — they are not
                            uploaded or shared over the network.
                        </p>
                        <p className="text-xs text-[#8882A4] leading-relaxed">
                            A REC indicator appears on the Controller (and optionally Speaker View) while a session
                            is archiving. Pause keeps recording by default. Manage folders from the Sessions sidebar.
                            Free disk space under ~2 GB may block or warn before a new archive starts.
                        </p>
                        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-xs text-emerald-200/90">
                            Privacy: NFR-25 — primary mic audio is processed on-device only.
                        </div>

                        <div className="border-t border-[#2E2542] pt-5 mt-2">
                            <div className="flex items-center gap-2 mb-3">
                                <PiMoon className="text-[#A788FA]" size={18} />
                                <h3 className="text-sm font-black uppercase tracking-widest text-[#F5F2FA]">Sleep prevention</h3>
                            </div>
                            <p className="text-xs text-[#8882A4] leading-relaxed mb-4">
                                Keeps displays and projectors awake while OCS is protecting your service.
                                Default is Always (recommended for live AV).
                            </p>
                            {!sleepProbeOk && (
                                <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-xs text-amber-200 mb-4">
                                    Display sleep prevention could not be verified. Screens may still sleep mid-service.
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 'always', label: 'Always' },
                                    { id: 'live', label: 'Only while live' },
                                ].map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setSleepPreventionMode(opt.id)}
                                        className={`px-4 py-3 rounded-2xl text-xs font-bold border transition-all ${
                                            sleepMode === opt.id
                                                ? 'bg-[#A788FA]/20 border-[#A788FA] text-[#A788FA]'
                                                : 'bg-transparent border-[#2E2542] text-[#8882A4] hover:border-white/20 hover:text-white'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="border-t border-[#2E2542] pt-5 mt-2">
                            <h3 className="text-sm font-black uppercase tracking-widest text-[#F5F2FA] mb-1">Transcription language</h3>
                            <p className="text-xs text-[#8882A4] leading-relaxed mb-4">
                                OCS transcribes only the selected language. When an interpreter speaks another language
                                on the same mic, those chunks are skipped (whisper language detection per VAD segment).
                                Requires a multilingual whisper model (`ggml-tiny.bin`) for reliable detection; English-only
                                models use a limited heuristic fallback.
                            </p>
                            <label className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest block mb-2">
                                Target language
                            </label>
                            <select
                                value={transcriptionLanguage}
                                onChange={(e) => setTranscriptionLang(e.target.value)}
                                className="w-full bg-[#0B0814] border border-[#2E2542] rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-[#A788FA] mb-4"
                            >
                                {[
                                    { id: 'en', label: 'English' },
                                    { id: 'yo', label: 'Yoruba' },
                                    { id: 'fr', label: 'French' },
                                    { id: 'es', label: 'Spanish' },
                                    { id: 'pt', label: 'Portuguese' },
                                    { id: 'sw', label: 'Swahili' },
                                    { id: 'ha', label: 'Hausa' },
                                    { id: 'ig', label: 'Igbo' },
                                    { id: 'de', label: 'German' },
                                    { id: 'zh', label: 'Chinese' },
                                    { id: 'ar', label: 'Arabic' },
                                ].map((opt) => (
                                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                                ))}
                            </select>
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-1 accent-[#A788FA]"
                                    checked={languageGateEnabled}
                                    onChange={(e) => setLanguageGate(e.target.checked)}
                                />
                                <span>
                                    <span className="text-sm text-[#F5F2FA] font-semibold block">Filter non-target languages</span>
                                    <span className="text-[11px] text-[#8882A4]">
                                        Skip interpreter / other-language chunks. Applies to primary mic and secondary PTT.
                                    </span>
                                </span>
                            </label>
                        </div>

                        <div className="border-t border-[#2E2542] pt-5 mt-2">
                            <h3 className="text-sm font-black uppercase tracking-widest text-[#F5F2FA] mb-1">Transcript correction</h3>
                            <p className="text-xs text-[#8882A4] leading-relaxed mb-4">
                                Two separate features. Both default off. Session cleanup keeps a raw transcript file;
                                AI cleanup is skipped if Ollama is unavailable.
                            </p>
                            <label className="flex items-start gap-3 mb-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-1 accent-[#A788FA]"
                                    checked={liveTranscriptCorrection}
                                    onChange={(e) => setLiveCorrection(e.target.checked)}
                                />
                                <span>
                                    <span className="text-sm text-[#F5F2FA] font-semibold block">Correct Live Transcript (dictionary)</span>
                                    <span className="text-[11px] text-[#8882A4]">Fast display-only cleanup of Bible/church words. Does not change matching or archives.</span>
                                </span>
                            </label>
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-1 accent-[#A788FA]"
                                    checked={sessionTranscriptCleanup}
                                    onChange={(e) => setSessionCleanup(e.target.checked)}
                                />
                                <span>
                                    <span className="text-sm text-[#F5F2FA] font-semibold block">Clean session PDF transcript (local AI)</span>
                                    <span className="text-[11px] text-[#8882A4]">Post-timer Ollama pass with validation. Raw transcript always preserved.</span>
                                </span>
                            </label>
                        </div>
                    </div>
                )}

                {/* ─── INTRO & OUTRO BUMPERS TAB ─── */}
                {activeTab === 'bumpers' && (
                    <div className="space-y-6">
                        {/* Auto-Merge Master Switch */}
                        <div className="bg-[#1A1428] border border-[#2E2542] p-6 rounded-3xl">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-pulse" />
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

                        {/* Two Bumpers Columns: Intro & Outro */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* INTRO BUMPER */}
                            <div className="bg-[#1A1428] border border-[#2E2542] rounded-3xl p-6 flex flex-col justify-between space-y-4">
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="px-3 py-1 rounded-full bg-[#A788FA]/20 text-[#A788FA] text-[10px] font-black uppercase tracking-wider">
                                                Intro (Beginning)
                                            </span>
                                            {bumpers.intro && (
                                                <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                                                    <PiCheckCircle size={14} /> Active
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <h4 className="text-base font-bold text-white mb-1">Session Intro Clip</h4>
                                    <p className="text-xs text-[#8882A4] mb-4">
                                        Plays first before sermon or presentation recording begins.
                                    </p>

                                    {bumpers.intro ? (
                                        <div className="space-y-3">
                                            <div className="w-full bg-[#0B0814] rounded-2xl overflow-hidden border border-[#2E2542] aspect-video flex items-center justify-center relative group">
                                                {bumpers.intro.hasVideo ? (
                                                    <video
                                                        src={bumpers.intro.url}
                                                        controls
                                                        className="w-full h-full object-contain"
                                                    />
                                                ) : (
                                                    <div className="p-6 flex flex-col items-center justify-center text-center gap-2 w-full">
                                                        <PiVideo size={36} className="text-[#A788FA]" />
                                                        <audio src={bumpers.intro.url} controls className="w-full mt-2" />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between text-xs bg-[#0B0814]/70 p-3 rounded-2xl border border-[#2E2542]/60">
                                                <div className="truncate pr-2">
                                                    <span className="font-mono text-[#F5F2FA] block truncate">{bumpers.intro.name}</span>
                                                    <span className="text-[10px] text-[#8882A4]">
                                                        {formatBumperBytes(bumpers.intro.sizeBytes)} • {Math.round(bumpers.intro.durationSec || 0)}s duration
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="border-2 border-dashed border-[#2E2542] rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 bg-[#0B0814]/40">
                                            <div className="w-12 h-12 rounded-full bg-[#2E2542]/50 flex items-center justify-center text-[#8882A4]">
                                                <PiFilmStrip size={24} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-[#F5F2FA]">No Intro Uploaded</p>
                                                <p className="text-[11px] text-[#8882A4]">Select an MP4, MOV, WebM, or audio file</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-3 pt-2">
                                    <button
                                        disabled={bumperBusy}
                                        onClick={() => handleUploadBumper('intro')}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#A788FA] text-[#0B0814] text-xs font-black uppercase tracking-wider hover:bg-[#B89CFF] transition-all disabled:opacity-50"
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
                                        <div className="flex items-center gap-2">
                                            <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-wider">
                                                Outro (End)
                                            </span>
                                            {bumpers.outro && (
                                                <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                                                    <PiCheckCircle size={14} /> Active
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <h4 className="text-base font-bold text-white mb-1">Session Outro Clip</h4>
                                    <p className="text-xs text-[#8882A4] mb-4">
                                        Appended automatically to the end of the recording session.
                                    </p>

                                    {bumpers.outro ? (
                                        <div className="space-y-3">
                                            <div className="w-full bg-[#0B0814] rounded-2xl overflow-hidden border border-[#2E2542] aspect-video flex items-center justify-center relative group">
                                                {bumpers.outro.hasVideo ? (
                                                    <video
                                                        src={bumpers.outro.url}
                                                        controls
                                                        className="w-full h-full object-contain"
                                                    />
                                                ) : (
                                                    <div className="p-6 flex flex-col items-center justify-center text-center gap-2 w-full">
                                                        <PiVideo size={36} className="text-indigo-400" />
                                                        <audio src={bumpers.outro.url} controls className="w-full mt-2" />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between text-xs bg-[#0B0814]/70 p-3 rounded-2xl border border-[#2E2542]/60">
                                                <div className="truncate pr-2">
                                                    <span className="font-mono text-[#F5F2FA] block truncate">{bumpers.outro.name}</span>
                                                    <span className="text-[10px] text-[#8882A4]">
                                                        {formatBumperBytes(bumpers.outro.sizeBytes)} • {Math.round(bumpers.outro.durationSec || 0)}s duration
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="border-2 border-dashed border-[#2E2542] rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 bg-[#0B0814]/40">
                                            <div className="w-12 h-12 rounded-full bg-[#2E2542]/50 flex items-center justify-center text-[#8882A4]">
                                                <PiFilmStrip size={24} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-[#F5F2FA]">No Outro Uploaded</p>
                                                <p className="text-[11px] text-[#8882A4]">Select an MP4, MOV, WebM, or audio file</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-3 pt-2">
                                    <button
                                        disabled={bumperBusy}
                                        onClick={() => handleUploadBumper('outro')}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#A788FA] text-[#0B0814] text-xs font-black uppercase tracking-wider hover:bg-[#B89CFF] transition-all disabled:opacity-50"
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
                )}

                {/* ─── NDI & BROADCAST STREAMING TAB (FR-4.41–FR-4.44) ─── */}
                {activeTab === 'ndi' && (
                    <div className="space-y-6">
                        <div className="bg-[#1A1428] border border-[#2E2542] p-6 rounded-3xl">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${ndiConfig.enabled ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/10 text-[#8882A4]'}`}>
                                        <PiBroadcast size={22} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-base text-white">NDI & Broadcast Streaming</h3>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                ndiConfig.enabled
                                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                    : 'bg-white/10 text-[#8882A4]'
                                            }`}>
                                                {ndiConfig.enabled ? '● Active' : '○ Off by Default'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-[#8882A4]">Broadcast OCS outputs to OBS Studio, vMix, Zoom, and TriCaster across the local network.</p>
                                    </div>
                                </div>

                                {/* Master Toggle */}
                                <button
                                    type="button"
                                    onClick={() => handleToggleNdi(!ndiConfig.enabled)}
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                        ndiConfig.enabled ? 'bg-cyan-500' : 'bg-[#2E2542]'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            ndiConfig.enabled ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            {/* Plain-Language Exposure Notice Banner (FR-4.43) */}
                            <div className="bg-[#0B0814] p-4 rounded-2xl border border-amber-500/30 flex items-start gap-3 my-4">
                                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 shrink-0 mt-0.5">
                                    <PiShieldWarning size={20} />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-amber-300">LAN Broadcast Security Notice (FR-4.43)</h4>
                                    <p className="text-xs text-[#A89EC4] leading-relaxed">
                                        NDI and broadcast streaming is <strong>disabled by default</strong> on launch. When enabled, anyone connected to this local network (LAN / Wi-Fi) will be able to view your display feed without a password via OBS Studio, vMix, or a browser. Only enable this on a trusted, secure production network.
                                    </p>
                                </div>
                            </div>

                            {ndiConfig.enabled ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                    <div className="bg-[#0B0814] p-4 rounded-2xl border border-[#2E2542] space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-white">Channel 1: Program Output</span>
                                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">1080p • Alpha</span>
                                        </div>
                                        <p className="text-xs text-[#8882A4]">Main projector feed, Bible scripture, lyrics & slide decks with transparent background.</p>
                                        
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between bg-white/5 p-2 rounded-xl border border-white/5">
                                                <span className="text-[11px] font-mono text-cyan-400 truncate mr-2">
                                                    {ndiStatus?.urls?.programOverlay || `http://${ndiStatus?.localIp || '127.0.0.1'}:4000/overlay/program`}
                                                </span>
                                                <button
                                                    onClick={() => copyToClipboard(ndiStatus?.urls?.programOverlay || `http://${ndiStatus?.localIp || '127.0.0.1'}:4000/overlay/program`, 'prog-over')}
                                                    className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold flex items-center gap-1 transition-all"
                                                >
                                                    {copiedUrl === 'prog-over' ? <PiCheck className="text-emerald-400" /> : <PiCopy />}
                                                    <span>{copiedUrl === 'prog-over' ? 'Copied' : 'Copy'}</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-[#0B0814] p-4 rounded-2xl border border-[#2E2542] space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-white">Channel 2: Stage Display</span>
                                            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[10px] font-bold">Confidence Feed</span>
                                        </div>
                                        <p className="text-xs text-[#8882A4]">Live stage display with synchronized countdown timer, active passage & speaker notes.</p>
                                        
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between bg-white/5 p-2 rounded-xl border border-white/5">
                                                <span className="text-[11px] font-mono text-purple-400 truncate mr-2">
                                                    {ndiStatus?.urls?.stageOverlay || `http://${ndiStatus?.localIp || '127.0.0.1'}:4000/overlay/stage`}
                                                </span>
                                                <button
                                                    onClick={() => copyToClipboard(ndiStatus?.urls?.stageOverlay || `http://${ndiStatus?.localIp || '127.0.0.1'}:4000/overlay/stage`, 'stage-over')}
                                                    className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold flex items-center gap-1 transition-all"
                                                >
                                                    {copiedUrl === 'stage-over' ? <PiCheck className="text-emerald-400" /> : <PiCopy />}
                                                    <span>{copiedUrl === 'stage-over' ? 'Copied' : 'Copy'}</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-[#0B0814] p-6 rounded-2xl border border-[#2E2542] text-center space-y-2 mt-4">
                                    <p className="text-xs font-bold text-[#8882A4]">Broadcast server is inactive.</p>
                                    <p className="text-xs text-[#6B6488]">Turn on the master switch above to start streaming Program and Stage feeds across the network.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ─── LICENSE & AUTHENTICATION TAB (FR-13.1–FR-13.8) ─── */}
                {activeTab === 'license' && (
                    <div className="space-y-6 max-w-2xl">
                        <div className="bg-[#1A1428] p-6 rounded-3xl border border-[#2E2542] space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-400">
                                    <PiShieldCheck size={22} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Workstation License & Session</h3>
                                    <p className="text-xs text-[#8882A4]">Organization licensing & authentication status (FR-13.1–FR-13.8)</p>
                                </div>
                            </div>

                            {/* Organization & Account Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-[#0B0814] p-4 rounded-2xl border border-[#2E2542] space-y-1">
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#8882A4]">Licensed Organization</span>
                                    <p className="text-sm font-bold text-white">{authStatus?.orgName || 'Grace Community Church'}</p>
                                </div>
                                <div className="bg-[#0B0814] p-4 rounded-2xl border border-[#2E2542] space-y-1">
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#8882A4]">Account Email</span>
                                    <p className="text-sm font-bold text-white truncate">{authStatus?.email || 'admin@church.org'}</p>
                                </div>
                            </div>

                            {/* Session Status */}
                            <div className="bg-[#0B0814] p-4 rounded-2xl border border-[#2E2542] space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white">License State</span>
                                    {authStatus?.state === 'grace_period' ? (
                                        <span className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11px] font-black flex items-center gap-1.5">
                                            <PiWarning size={14} />
                                            <span>Offline Grace ({authStatus?.hoursRemaining || 72}h left)</span>
                                        </span>
                                    ) : authStatus?.authenticated ? (
                                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[11px] font-black flex items-center gap-1.5">
                                            <PiCheck size={14} />
                                            <span>Active & Verified</span>
                                        </span>
                                    ) : (
                                        <span className="px-2.5 py-1 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 text-[11px] font-black">
                                            Unauthenticated
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-[#8882A4] leading-relaxed">
                                    {authStatus?.state === 'grace_period'
                                        ? `Operating offline on cached credentials (FR-13.5). Re-validation will happen silently in the background when connectivity resumes.`
                                        : `Active license verified. Tokens stored securely in native OS Keychain / Credential store (FR-13.4).`}
                                </p>
                            </div>

                            {/* Logout Action (FR-13.6) */}
                            <div className="pt-2 border-t border-[#2E2542] flex items-center justify-between">
                                <div>
                                    <h4 className="text-xs font-bold text-white">Log Out Workstation</h4>
                                    <p className="text-[11px] text-[#6B6488]">Clears cached credentials and locks workstation until re-authenticated.</p>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    disabled={authLoading}
                                    className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-xs font-bold flex items-center gap-2 transition-all"
                                >
                                    <PiSignOut size={16} />
                                    <span>{authLoading ? 'Logging Out...' : 'Log Out'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ─── NDI Plain-Language Exposure Consent Modal (FR-4.43) ─── */}
            {showNdiConsentModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
                    <div className="bg-[#1A1428] border border-amber-500/40 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
                        <div className="flex items-center gap-3 text-amber-400">
                            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center">
                                <PiWarning size={28} />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-white">Enable NDI & Network Broadcast?</h3>
                                <p className="text-xs text-amber-300">Informed Consent Notice (FR-4.43)</p>
                            </div>
                        </div>

                        <div className="bg-[#0B0814] p-4 rounded-2xl border border-[#2E2542] text-xs text-[#DDD7EE] leading-relaxed space-y-2">
                            <p>
                                Anyone connected to this local network (LAN / Wi-Fi) will be able to view your display feed without a password via OBS Studio, vMix, or a browser.
                            </p>
                            <p className="text-[#8882A4]">
                                Only enable this on a trusted production network, not a public or guest Wi-Fi.
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowNdiConsentModal(false)}
                                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowNdiConsentModal(false);
                                    applyNdiState(true);
                                }}
                                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black text-xs font-black transition-all shadow-lg shadow-amber-500/20"
                            >
                                I Understand, Enable Streaming
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
