
import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

interface SocketState {
    socket: Socket | null;
    isConnected: boolean;
    isPaired: boolean;
    serverIp: string;
    connectionError: string | null;
    connect: (ip: string, pairingCode?: string) => void;
    disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
    socket: null,
    isConnected: false,
    isPaired: false,
    serverIp: '',
    connectionError: null,
    connect: (ip: string, pairingCode?: string) => {
        const current = get().socket;
        if (current) current.disconnect();

        const code = (pairingCode || '').trim();
        if (!code) {
            set({ connectionError: 'Enter the 6-digit pairing code from the desktop Remote panel' });
            return;
        }

        set({ connectionError: null, isPaired: false });

        const socket = io(`http://${ip}:4000`, {
            transports: ['websocket'],
            reconnectionAttempts: 5,
            timeout: 5000,
            auth: {
                code,
                token: code, // desktop accepts either code or opaque token
                deviceName: 'OCS Mobile',
            },
        });

        socket.on('connect', () => {
            console.log('Connected to server — awaiting pair confirmation');
            set({ isConnected: true, connectionError: null });
            // Fallback if handshake auth was ignored by an older desktop build
            socket.emit('pair', { code, token: code, deviceName: 'OCS Mobile' });
        });

        socket.on('pair-result', (result: { ok: boolean; error?: string }) => {
            if (result?.ok) {
                set({ isPaired: true, connectionError: null });
            } else {
                set({
                    isPaired: false,
                    connectionError: result?.error || 'Invalid pairing code',
                });
            }
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
            console.error('Connection Error:', err.message);
            set({ connectionError: `Connection failed: ${err.message}`, isPaired: false });
        });

        set({ socket, serverIp: ip });
    },
    disconnect: () => {
        const { socket } = get();
        if (socket) {
            socket.disconnect();
        }
        set({ socket: null, isConnected: false, isPaired: false, connectionError: null });
    }
}));
