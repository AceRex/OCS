
import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import * as FileSystem from 'expo-file-system/legacy';

interface AssetPayload {
    name: string;
    type: 'image' | 'video' | 'audio' | 'presentation' | 'media';
    size: number;
    mimeType?: string;
    uri?: string;
    dataBase64?: string;
}

interface SocketState {
    socket: Socket | null;
    isConnected: boolean;
    isPaired: boolean;
    isAdmin: boolean;
    deviceRole: 'admin' | 'stageManager' | 'speaker';
    serverIp: string;
    lastHost: string;
    lastCode: string;
    lastPort: number;
    deviceName: string;
    connectionError: string | null;
    setDeviceName: (name: string) => void;
    connect: (ip: string, pairingCode?: string, customPort?: number) => void;
    reconnectLastSession: () => void;
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
    sendStageControl: (command: string, payload?: any) => Promise<{ ok: boolean; error?: string }>;
}

export const useSocketStore = create<SocketState>((set, get) => ({
    socket: null,
    isConnected: false,
    isPaired: false,
    isAdmin: false,
    deviceRole: 'speaker' as const,
    serverIp: '',
    lastHost: '',
    lastCode: '',
    lastPort: 4000,
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
        if (current) {
            try { current.disconnect(); } catch (_) {}
        }

        const code = (pairingCode || get().lastCode || '').trim();
        let rawHost = (ip || get().lastHost || get().serverIp || '').trim();

        if (!rawHost) {
            set({ connectionError: 'Enter the IP address of the desktop workstation' });
            return;
        }

        if (!code) {
            set({ connectionError: 'Enter the 6-digit pairing code from the desktop Remote panel' });
            return;
        }

        let host = rawHost.replace(/^https?:\/\//, '');
        let targetPort = customPort || get().lastPort || 4000;
        if (host.includes(':')) {
            const [h, p] = host.split(':');
            host = h;
            targetPort = parseInt(p, 10) || targetPort;
        }

        // Persist session target immediately so reconnect button has it
        set({
            connectionError: null,
            isPaired: false,
            lastHost: host,
            lastCode: code,
            lastPort: targetPort,
            serverIp: host,
        });

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

        socket.on('pair-result', (result: { ok: boolean; error?: string; deviceName?: string; isAdmin?: boolean; deviceRole?: string }) => {
            if (result?.ok) {
                set({
                    isPaired: true,
                    connectionError: null,
                    lastHost: host,
                    lastCode: code,
                    lastPort: targetPort,
                    serverIp: host,
                });
                if (result.deviceName) {
                    set({ deviceName: result.deviceName });
                }
                if (result.isAdmin != null) {
                    set({ isAdmin: !!result.isAdmin });
                }
                const role = result.deviceRole as 'admin' | 'stageManager' | 'speaker' | undefined;
                if (role === 'admin' || role === 'stageManager' || role === 'speaker') {
                    set({ deviceRole: role });
                } else if (result.isAdmin) {
                    set({ deviceRole: 'admin' });
                }
                get().fetchPeers();
            } else {
                set({
                    isPaired: false,
                    isAdmin: false,
                    deviceRole: 'speaker',
                    connectionError: result?.error || 'Invalid pairing code',
                });
            }
        });

        socket.on('device-role-updated', (payload: { isAdmin?: boolean; deviceRole?: string }) => {
            console.log('[Remote] Role updated from desktop:', payload);
            if (payload?.isAdmin != null) {
                set({ isAdmin: !!payload.isAdmin });
            }
            const role = payload?.deviceRole as 'admin' | 'stageManager' | 'speaker' | undefined;
            if (role === 'admin' || role === 'stageManager' || role === 'speaker') {
                set({ deviceRole: role });
            } else if (payload?.isAdmin != null) {
                set({ deviceRole: payload.isAdmin ? 'admin' : 'speaker' });
            }
        });

        socket.on('device-renamed', (payload: { name?: string }) => {
            if (payload?.name) {
                set({ deviceName: payload.name });
            }
        });

        socket.on('intercom-message', (message: { fromName: string; audioBase64: string; format: string; timestamp: number }) => {
            console.log('[Intercom] Received audio message from:', message.fromName);
            set({ incomingIntercom: { ...message, timestamp: Date.now(), msgId: `${Date.now()}_${Math.random()}` } });
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
    reconnectLastSession: () => {
        const { lastHost, lastCode, lastPort, serverIp, connect } = get();
        const targetHost = lastHost || serverIp;
        if (targetHost && lastCode) {
            console.log(`[Remote Socket] Reconnecting to ${targetHost}:${lastPort || 4000}...`);
            connect(targetHost, lastCode, lastPort || 4000);
        } else if (targetHost) {
            console.log(`[Remote Socket] Reconnecting with fallback host ${targetHost}...`);
            connect(targetHost, '', lastPort || 4000);
        }
    },
    disconnect: () => {
        const { socket } = get();
        if (socket) {
            socket.disconnect();
        }
        set({ socket: null, isConnected: false, isPaired: false, connectionError: null });
    },
    sendAsset: async (asset: AssetPayload): Promise<{ ok: boolean; error?: string; message?: string; role?: string }> => {
        const { socket, isPaired, serverIp, lastHost, lastPort, lastCode, deviceName } = get();
        if (!isPaired) {
            return { ok: false, error: 'Must be connected and paired with desktop to send assets' };
        }

        const MAX_BYTES = 50 * 1024 * 1024;
        if (asset.size > MAX_BYTES) {
            return { ok: false, error: 'File exceeds 50MB limit' };
        }

        const host = lastHost || serverIp || 'localhost';
        const port = lastPort || 4000;

        // 1. Native Direct Stream Upload via FileSystem.uploadAsync (Handles all content:// & file:// URIs without JS base64 memory overhead)
        if (asset.uri) {
            try {
                console.log(`[sendAsset] Streaming upload via uploadAsync: ${asset.name} (${asset.uri})`);
                const uploadRes = await FileSystem.uploadAsync(`http://${host}:${port}/api/upload-asset-raw`, asset.uri, {
                    httpMethod: 'POST',
                    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                    headers: {
                        'x-filename': encodeURIComponent(asset.name),
                        'x-filetype': asset.type,
                        'x-devicename': encodeURIComponent(deviceName || 'Mobile Companion'),
                        'content-type': asset.mimeType || 'application/octet-stream',
                    },
                });

                if (uploadRes.status >= 200 && uploadRes.status < 300) {
                    const data = JSON.parse(uploadRes.body);
                    if (data?.ok) {
                        return { ok: true, message: data.message || 'Asset accepted by desktop operator', role: data.role };
                    }
                    if (data?.error) {
                        return { ok: false, error: data.error };
                    }
                }
            } catch (streamErr) {
                console.warn('[sendAsset] Native streaming upload failed, falling back to JSON upload:', streamErr);
            }
        }

        // 2. Direct HTTP upload route with JSON payload
        if (asset.dataBase64) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 120000); // 2min timeout
                const response = await fetch(`http://${host}:${port}/api/upload-asset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...asset,
                        deviceName: deviceName || 'Mobile Companion',
                        pairingCode: lastCode,
                    }),
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                const data = await response.json();
                if (data?.ok) {
                    return { ok: true, message: data.message || 'Asset accepted by desktop operator', role: data.role };
                }
                if (data?.error) {
                    return { ok: false, error: data.error };
                }
            } catch (httpErr) {
                console.warn('[sendAsset] HTTP JSON upload failed, falling back to WebSocket:', httpErr);
            }
        }

        // 3. WebSocket Fallback
        if (!socket || !socket.connected) {
            return { ok: false, error: 'Desktop disconnected' };
        }

        return new Promise((resolve) => {
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
    },
    sendStageControl: (command: string, payload?: any): Promise<{ ok: boolean; error?: string }> => {
        return new Promise((resolve) => {
            const { socket, isPaired, isAdmin } = get();
            if (!socket || !socket.connected || !isPaired) {
                resolve({ ok: false, error: 'Must be connected and paired with desktop' });
                return;
            }
            if (!isAdmin) {
                resolve({ ok: false, error: 'Admin access required for Stage Master Control' });
                return;
            }

            socket.emit('mobile-action', {
                type: 'stage-control',
                command,
                payload,
            }, (response: { ok: boolean; error?: string }) => {
                if (response?.ok) {
                    resolve({ ok: true });
                } else {
                    resolve({ ok: false, error: response?.error || 'Command execution failed' });
                }
            });
        });
    },
}));
