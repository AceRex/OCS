
import React, { useEffect, useState } from 'react';
import { PiDeviceMobile, PiWarning, PiArrowsClockwise, PiQrCode } from "react-icons/pi";

export default function MobileConnectController() {
    const [serverInfo, setServerInfo] = useState({
        ip: 'Loading...',
        port: '...',
        pairingCode: '------',
        pairingQrDataUrl: null,
    });
    const [connectedDevices, setConnectedDevices] = useState([]);
    const [status, setStatus] = useState('offline'); // offline, ready, connected
    const [rejectedAttempts, setRejectedAttempts] = useState(0);

    const applyInfo = (info) => {
        setServerInfo({
            ip: info.ip,
            port: info.port,
            pairingCode: info.pairingCode || '------',
            pairingQrDataUrl: info.pairingQrDataUrl || null,
        });
        if (info.devices) {
            setConnectedDevices(info.devices);
        }
        setStatus(info.devices && info.devices.length > 0 ? 'connected' : 'ready');
    };

    const refreshInfo = () => {
        if (window.electron && window.electron.Network) {
            window.electron.Network.getServerInfo().then(applyInfo);
        }
    };

    const rotatePairing = async () => {
        if (!window.electron?.Network?.rotatePairing) return;
        const info = await window.electron.Network.rotatePairing();
        applyInfo(info);
        setRejectedAttempts(0);
    };

    useEffect(() => {
        refreshInfo();

        const cleanupConnect = window.electron.Network.onMobileConnected((device) => {
            setConnectedDevices(prev => {
                if (prev.some(d => d.id === device.id)) return prev;
                return [...prev, device];
            });
            setStatus('connected');
        });

        const cleanupDisconnect = window.electron.Network.onMobileDisconnected((device) => {
            setConnectedDevices(prev => {
                const next = prev.filter(d => d.id !== device.id);
                if (next.length === 0) setStatus('ready');
                return next;
            });
        });

        const cleanupUnpaired = window.electron.Network.onMobileUnpairedAttempt
            ? window.electron.Network.onMobileUnpairedAttempt(() => {
                setRejectedAttempts(n => n + 1);
            })
            : () => {};

        return () => {
            cleanupConnect();
            cleanupDisconnect();
            cleanupUnpaired();
        };
    }, []);

    return (
        <div className="w-full h-full p-8 flex flex-col gap-6 animate-fade-in">
            <header className="flex items-center gap-4 mb-4">
                <div className="p-3 text-ash/70 rounded-full">
                    <PiDeviceMobile size={32} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3 text-ash/70">
                        Mobile Connection
                        <button
                            onClick={refreshInfo}
                            className="p-1.5 bg-white hover:bg-white/10 rounded-lg transition-colors border border-white/5"
                            title="Refresh Server Info"
                        >
                            <PiArrowsClockwise className="text-light hover:text-white" size={16} />
                        </button>
                    </h1>
                    <p className="text-ash/60 text-sm">Pair a mobile device with a QR code or 6-digit code — unpaired devices cannot control the display</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
                {/* Connection Card */}
                <div className="bg-white/5 border border-ash/70 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-6 shadow-xl">
                    <div className="text-sm font-medium uppercase tracking-widest text-light flex items-center gap-2">
                        <PiQrCode size={16} /> Scan to Pair
                    </div>

                    {serverInfo.pairingQrDataUrl ? (
                        <img
                            src={serverInfo.pairingQrDataUrl}
                            alt="OCS pairing QR code"
                            className="w-56 h-56 rounded-xl bg-white p-2 shadow-lg"
                        />
                    ) : (
                        <div className="w-56 h-56 rounded-xl bg-white/10 flex items-center justify-center text-white/40 text-sm">
                            Generating QR…
                        </div>
                    )}

                    <div className="flex flex-col items-center gap-1">
                        <div className="text-xs uppercase tracking-widest text-white/40">Pairing Code</div>
                        <div className="text-5xl font-mono font-bold text-cyan-300 tracking-[0.35em] select-all">
                            {serverInfo.pairingCode}
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-1">
                        <div className="text-xs uppercase tracking-widest text-white/40">Network</div>
                        <div className="text-2xl font-mono font-bold text-blue-400 select-all">
                            {serverInfo.ip}
                            <span className="text-white/40 text-lg">:{serverInfo.port}</span>
                        </div>
                    </div>

                    <button
                        onClick={rotatePairing}
                        className="text-xs px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        Rotate pairing code
                    </button>

                    <div className="w-full max-w-md bg-white/5 rounded-xl p-6 text-left border border-white/5">
                        <h3 className="text-white/80 font-bold mb-2 flex items-center gap-2">
                            <PiWarning className="text-yellow-500" /> Instructions
                        </h3>
                        <ol className="list-decimal list-inside text-sm text-white/60 space-y-1">
                            <li>Join the <strong>same Wi-Fi</strong> as this computer.</li>
                            <li>Open OCS Mobile → <strong>Connect</strong>.</li>
                            <li>Scan the QR code, or enter the IP plus the 6-digit code.</li>
                            <li>Unpaired guests on guest Wi-Fi cannot control the display.</li>
                        </ol>
                    </div>
                </div>

                {/* Status Card */}
                <div className="flex flex-col gap-6">
                    <div className="bg-white/5 border border-ash/70 rounded-2xl p-6 flex-1">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            Paired Devices
                            <span className="bg-white/10 text-xs px-2 py-1 rounded-full">{connectedDevices.length}</span>
                        </h2>

                        {connectedDevices.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-white/30 gap-2">
                                <PiDeviceMobile size={48} />
                                <p>No paired devices</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {connectedDevices.map((device, idx) => (
                                    <div key={device.id || idx} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center">
                                                <PiDeviceMobile size={20} />
                                            </div>
                                            <div>
                                                <div className="font-bold">{device.name || `Device ${idx + 1}`}</div>
                                                <div className="text-xs text-white/40 font-mono">{device.ip || device.id}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
                                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                                Paired
                                            </div>
                                            {window.electron?.Network?.disconnectDevice && (
                                                <button
                                                    onClick={() => window.electron.Network.disconnectDevice(device.id)}
                                                    className="text-xs text-red-300/80 hover:text-red-300 px-2 py-1 rounded border border-red-500/20"
                                                >
                                                    Disconnect
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className={`rounded-2xl p-6 border ${status === 'ready' || status === 'connected' ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                        <h3 className="font-bold mb-1 flex items-center gap-2">
                            System Status: <span className="uppercase">{status}</span>
                        </h3>
                        <p className="text-xs opacity-70">
                            Socket server listening with pairing-token auth (FR-6.10).
                            {rejectedAttempts > 0 && (
                                <span className="text-amber-300"> · {rejectedAttempts} unpaired attempt{rejectedAttempts === 1 ? '' : 's'} blocked</span>
                            )}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
