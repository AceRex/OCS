
import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

interface AssetPayload {
    name: string;
    type: 'image' | 'video' | 'audio' | 'presentation' | 'media';
    size: number;
    mimeType?: string;
    dataBase64: string;
}

interface SocketState {
    socket: Socket | null;
    isConnected: boolean;
    isPaired: boolean;
    serverIp: string;
    deviceName: string;
    connectionError: string | null;
    setDeviceName: (name: string) => void;
    connect: (ip: string, pairingCode?: string, customPort?: number) => void;
    disconnect: () => void;
    sendAsset: (asset: AssetPayload) => Promise<{ ok: boolean; error?: string; message?: string; role?: string }>;
    setVoiceActive: (active: boolean) => void;
    sendVoiceAudio: (audioData: { dataBase64: string; format?: string; durationMs?: number; role?: string }) => Promise<{ ok: boolean; error?: string; text?: string; confidence?: number }>;
    peers: Array<{ id: string; name: string; ip: string; isVoiceActive?: boolean }>;
    incomingIntercom: { fromName: string; audioBase64: string; format: string; timestamp: number } | null;
    fetchPeers: () => Promise<Array<{ id: string; name: string; ip: string; isVoiceActive?: boolean }>>;
    speakToPeer: (payload: { target: string; audioBase64: string; format?: string; durationMs?: number }) => Promise<{ ok: boolean; error?: string }>;
    streamMicChunk: (payload: { volume: number; active: boolean }) => void;
    clearIncomingIntercom: () => void;
    sendScene: (scene: any) => Promise<{ ok: boolean; error?: string; message?: string; scene?: any }>;
}

export const useSocketStore = create<SocketState>((set, get) => ({
    socket: null,
    isConnected: false,
    isPaired: false,
    serverIp: '',
    deviceName: 'Mobile Companion',
    connectionError: null,
    peers: [],
    incomingIntercom: null,
    clearIncomingIntercom: () => set({ incomingIntercom: null }),
    streamMicChunk: (payload: { volume: number; active: boolean }) => {
        const { socket } = get();
        if (socket && socket.connected) {
            socket.emit('mobile-mic-stream', payload);
        }
    },
    setVoiceActive: (active: boolean) => {
        const { socket } = get();
        if (socket && socket.connected) {
            socket.emit('mobile-voice-state', { active });
        }
    },
    setDeviceName: (name: string) => {
        const trimmed = (name || '').trim();
        if (!trimmed) return;
        set({ deviceName: trimmed });
        const { socket } = get();
        if (socket && socket.connected) {
            socket.emit('device-rename', { name: trimmed });
        }
    },
    fetchPeers: (): Promise<Array<{ id: string; name: string; ip: string; isVoiceActive?: boolean }>> => {
        return new Promise((resolve) => {
            const { socket, isPaired } = get();
            if (!socket || !socket.connected || !isPaired) {
                resolve([]);
                return;
            }
            socket.emit('intercom-get-peers', (res: { ok: boolean; peers: any[] }) => {
                const list = res?.ok ? res.peers || [] : [];
                set({ peers: list });
                resolve(list);
            });
        });
    },
    speakToPeer: (payload: { target: string; audioBase64: string; format?: string; durationMs?: number }): Promise<{ ok: boolean; error?: string }> => {
        return new Promise((resolve) => {
            const { socket, isPaired } = get();
            if (!socket || !socket.connected || !isPaired) {
                resolve({ ok: false, error: 'Must be connected to speak' });
                return;
            }
            socket.emit('intercom-speak', payload, (res: { ok: boolean; error?: string }) => {
                if (res?.ok) resolve({ ok: true });
                else resolve({ ok: false, error: res?.error || 'Failed to send audio message' });
            });
        });
    },
    connect: (ip: string, pairingCode?: string, customPort?: number) => {
        const current = get().socket;
        if (current) current.disconnect();

        const code = (pairingCode || '').trim();
        if (!code) {
            set({ connectionError: 'Enter the 6-digit pairing code from the desktop Remote panel' });
            return;
        }

        set({ connectionError: null, isPaired: false });

        let host = ip.trim().replace(/^https?:\/\//, '');
        let targetPort = customPort || 4000;
        if (host.includes(':')) {
            const [h, p] = host.split(':');
            host = h;
            targetPort = parseInt(p, 10) || targetPort;
        }

        const currentDeviceName = get().deviceName || 'Mobile Companion';

        const socket = io(`http://${host}:${targetPort}`, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 15000,
            auth: {
                code,
                token: code, // desktop accepts either code or opaque token
                deviceName: currentDeviceName,
            },
        });

        socket.on('connect', () => {
            console.log('Connected to server — awaiting pair confirmation');
            set({ isConnected: true, connectionError: null });
            socket.emit('pair', { code, token: code, deviceName: get().deviceName || 'Mobile Companion' });
        });

        socket.on('reconnect', () => {
            console.log('Reconnected to server — refreshing pairing');
            socket.emit('pair', { code, token: code, deviceName: get().deviceName || 'Mobile Companion' });
        });

        socket.on('pair-result', (result: { ok: boolean; error?: string; deviceName?: string }) => {
            if (result?.ok) {
                set({ isPaired: true, connectionError: null });
                if (result.deviceName) {
                    set({ deviceName: result.deviceName });
                }
                get().fetchPeers();
            } else {
                set({
                    isPaired: false,
                    connectionError: result?.error || 'Invalid pairing code',
                });
            }
        });

        socket.on('device-renamed', (payload: { name?: string }) => {
            if (payload?.name) {
                set({ deviceName: payload.name });
            }
        });

        socket.on('intercom-message', (message: { fromName: string; audioBase64: string; format: string; timestamp: number }) => {
            console.log('[Intercom] Received audio message from:', message.fromName);
            set({ incomingIntercom: message });
        });

        socket.on('pair-required', (payload: { message?: string }) => {
            set({
                isPaired: false,
                connectionError: payload?.message || 'Pairing required',
            });
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            set({ isConnected: false, isPaired: false });
        });

        socket.on('connect_error', (err) => {
            console.warn('[Remote Socket] Connection notice:', err.message);
            if (!get().isPaired) {
                set({ connectionError: `Connection failed: ${err.message}` });
            }
        });

        set({ socket, serverIp: ip });
    },
    disconnect: () => {
        const { socket } = get();
        if (socket) {
            socket.disconnect();
        }
        set({ socket: null, isConnected: false, isPaired: false, connectionError: null });
    },
    sendAsset: (asset: AssetPayload): Promise<{ ok: boolean; error?: string; message?: string; role?: string }> => {
        return new Promise((resolve) => {
            const { socket, isPaired } = get();
            if (!socket || !socket.connected || !isPaired) {
                resolve({ ok: false, error: 'Must be connected and paired with desktop to send assets' });
                return;
            }

            // Size limit: 50MB
            const MAX_BYTES = 50 * 1024 * 1024;
            if (asset.size > MAX_BYTES) {
                resolve({ ok: false, error: 'File exceeds 50MB limit' });
                return;
            }

            socket.emit('mobile-asset-transfer', asset, (response: { ok: boolean; error?: string; message?: string; role?: string }) => {
                if (response?.ok) {
                    resolve({ ok: true, message: response.message || 'Asset accepted by desktop operator', role: response.role });
                } else {
                    resolve({ ok: false, error: response?.error || 'Transfer declined or failed' });
                }
            });
        });
    },
    sendVoiceAudio: (audioData: { dataBase64: string; format?: string; durationMs?: number; role?: string }): Promise<{ ok: boolean; error?: string; text?: string; confidence?: number }> => {
        return new Promise((resolve) => {
            const { socket, isPaired } = get();
            if (!socket || !socket.connected || !isPaired) {
                resolve({ ok: false, error: 'Must be paired with desktop to send voice input' });
                return;
            }

            socket.emit('mobile-audio', {
                dataBase64: audioData.dataBase64,
                format: audioData.format || 'pcm',
                durationMs: audioData.durationMs,
                source: 'secondary',
                role: audioData.role || 'final',
            }, (response: { ok: boolean; error?: string; text?: string; confidence?: number }) => {
                if (response?.ok) {
                    resolve({ ok: true, text: response.text, confidence: response.confidence });
                } else {
                    resolve({ ok: false, error: response?.error || 'Voice transcription failed' });
                }
            });
        });
    },
    sendScene: (sceneData: any): Promise<{ ok: boolean; error?: string; message?: string; scene?: any }> => {
        return new Promise((resolve) => {
            const { socket, isPaired } = get();
            if (!socket || !socket.connected || !isPaired) {
                resolve({ ok: false, error: 'Must be paired with desktop to share scenes' });
                return;
            }

            socket.emit('mobile-scene-transfer', { scene: sceneData }, (response: { ok: boolean; error?: string; message?: string; scene?: any }) => {
                if (response?.ok) {
                    resolve({ ok: true, message: response.message || 'Scene shared with desktop controller', scene: response.scene });
                } else {
                    resolve({ ok: false, error: response?.error || 'Failed to transfer scene' });
                }
            });
        });
    }
}));
