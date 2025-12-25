
import React, { useEffect, useState } from 'react';
import { PiDeviceMobile, PiCheckCircle, PiXCircle, PiWarning, PiArrowsClockwise } from "react-icons/pi";

export default function MobileConnectController() {
    const [serverInfo, setServerInfo] = useState({ ip: 'Loading...', port: '...' });
    const [connectedDevices, setConnectedDevices] = useState([]);
    const [status, setStatus] = useState('offline'); // offline, ready, connected

    const refreshInfo = () => {
        if (window.electron && window.electron.Network) {
            window.electron.Network.getServerInfo().then(info => {
                setServerInfo({ ip: info.ip, port: info.port });
                if (info.devices) {
                    setConnectedDevices(info.devices);
                }
                setStatus(info.devices && info.devices.length > 0 ? 'connected' : 'ready');
            });
        }
    };

    useEffect(() => {
        // Get Server Info
        refreshInfo();

        // Listen for connections
        const cleanupConnect = window.electron.Network.onMobileConnected((device) => {
            setConnectedDevices(prev => [...prev, device]);
            setStatus('connected');
        });

        const cleanupDisconnect = window.electron.Network.onMobileDisconnected((device) => {
            setConnectedDevices(prev => prev.filter(d => d.id !== device.id));
            // If no more devices, set status back to ready
            setConnectedDevices(prev => {
                if (prev.length === 0) setStatus('ready');
                return prev;
            });
        });

        return () => {
            cleanupConnect();
            cleanupDisconnect();
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
                    <p className="text-ash/60 text-sm">Connect your mobile device to control OCS remotely</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
                {/* Connection Card */}
                <div className="bg-white/5 border border-ash/70 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-6 shadow-xl">
                    <div className="text-sm font-medium uppercase tracking-widest text-light">Network Address</div>

                    <div className="flex flex-col items-center gap-2">
                        <div className="text-6xl font-mono font-bold text-blue-400 select-all">
                            {serverInfo.ip}
                        </div>
                        <div className="text-xl text-white/50 font-mono">
                            Port: {serverInfo.port}
                        </div>
                    </div>

                    <div className="w-full max-w-md bg-white/5 rounded-xl p-8 text-left border border-white/5">
                        <h3 className="text-white/80 font-bold mb-2 flex items-center gap-2">
                            <PiWarning className="text-yellow-500" /> Instructions:
                        </h3>
                        <ol className="list-decimal list-inside text-sm text-white/60 space-y-1">
                            <li>Ensure your mobile device is connected to the <strong>same Wi-Fi network</strong>.</li>
                            <li>Open the OCS Mobile App.</li>
                            <li>Navigate to the <strong>Connect</strong> tab.</li>
                            <li>Enter the IP Address shown above.</li>
                        </ol>
                    </div>
                </div>

                {/* Status Card */}
                <div className="flex flex-col gap-6">
                    <div className="bg-white/5 border border-ash/70 rounded-2xl p-6 flex-1">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            Connected Devices
                            <span className="bg-white/10 text-xs px-2 py-1 rounded-full">{connectedDevices.length}</span>
                        </h2>

                        {connectedDevices.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-white/30 gap-2">
                                <PiDeviceMobile size={48} />
                                <p>No devices connected</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {connectedDevices.map((device, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center">
                                                <PiDeviceMobile size={20} />
                                            </div>
                                            <div>
                                                <div className="font-bold">Device {idx + 1}</div>
                                                <div className="text-xs text-white/40 font-mono">{device.id}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
                                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                            Connected
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
                            The socket server is running and listening for incoming connections.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
