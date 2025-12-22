
import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

interface SocketState {
    socket: Socket | null;
    isConnected: boolean;
    serverIp: string;
    connectionError: string | null;
    connect: (ip: string) => void;
    disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
    socket: null,
    isConnected: false,
    serverIp: '',
    connectionError: null,
    connect: (ip: string) => {
        // Basic validation or cleanup check
        const current = get().socket;
        if (current) current.disconnect();

        set({ connectionError: null }); // Reset error

        const socket = io(`http://${ip}:4000`, {
            transports: ['websocket'],
            reconnectionAttempts: 5,
            timeout: 5000
        });

        socket.on('connect', () => {
            console.log('Connected to server');
            set({ isConnected: true, connectionError: null });
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            set({ isConnected: false });
        });

        socket.on('connect_error', (err) => {
            console.error('Connection Error:', err.message);
            set({ connectionError: `Connection failed: ${err.message}` });
        });

        set({ socket, serverIp: ip });
    },
    disconnect: () => {
        const { socket } = get();
        if (socket) {
            socket.disconnect();
        }
        set({ socket: null, isConnected: false, connectionError: null });
    }
}));
