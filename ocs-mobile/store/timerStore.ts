import { create } from 'zustand';
import { useSocketStore } from './socketStore';

export interface AgendaItem {
    _id: number | string;
    time: number;
    agenda: string;
    anchor: string;
}

interface TimerState {
    time: number;
    agenda: AgendaItem[];
    activeId: number | string | null;
    isPaused: boolean;
    isEventMode: boolean;
    theme: string;

    // Actions
    setTime: (time: number) => void;
    setAgenda: (agenda: AgendaItem[]) => void;
    addAgendaItem: (item: AgendaItem) => void;
    deleteAgendaItem: (id: number | string) => void;
    editAgendaItem: (id: number | string, updates: Partial<AgendaItem>, mode?: 'add' | 'replace' | 'preserve') => void;
    setActiveId: (id: number | string | null) => void;
    setIsPaused: (isPaused: boolean) => void;
    setEventMode: (isEventMode: boolean) => void;
    setTheme: (theme: string) => void;
    decrementTime: () => void;

    // Composite actions
    stopTimer: () => void;
    togglePause: () => void;
    startTimer: (time: number, activeId?: number | string | null, isEventMode?: boolean) => void;
}

export const useTimerStore = create<TimerState>((set) => ({
    time: 0,
    agenda: [],
    activeId: null,
    isPaused: false,
    isEventMode: false,
    theme: 'default',

    setTime: (time) => {
        set({ time });
    },
    setAgenda: (agenda) => set({ agenda }),
    addAgendaItem: (item) => {
        set((state) => ({ agenda: [...state.agenda, item] }));
        const socket = useSocketStore.getState().socket;
        if (socket) socket.emit('mobile-action', { type: 'add-agenda', payload: item });
    },
    deleteAgendaItem: (id) => {
        set((state) => ({ agenda: state.agenda.filter(i => i._id !== id) }));
        const socket = useSocketStore.getState().socket;
        if (socket) socket.emit('mobile-action', { type: 'delete-agenda', payload: { id } });
    },
    editAgendaItem: (id, updates, mode = 'replace') => {
        set((state) => ({
            agenda: state.agenda.map(i => i._id === id ? { ...i, ...updates } : i)
        }));
        const socket = useSocketStore.getState().socket;
        if (socket) socket.emit('mobile-action', { type: 'edit-agenda', payload: { _id: id, ...updates, mode } });
    },
    setActiveId: (activeId) => set({ activeId }),
    setIsPaused: (isPaused) => {
        set({ isPaused });
        const socket = useSocketStore.getState().socket;
        if (socket) socket.emit('mobile-action', { type: 'set-paused', payload: { paused: isPaused } });
    },
    setEventMode: (isEventMode) => set({ isEventMode }),
    setTheme: (theme) => set({ theme }),
    decrementTime: () => set((state) => ({ time: Math.max(0, state.time - 1) })),

    stopTimer: () => {
        set({ time: 0, activeId: null, isPaused: false, isEventMode: false });
        const socket = useSocketStore.getState().socket;
        if (socket) socket.emit('mobile-action', { type: 'stop-timer' });
    },
    togglePause: () => {
        set((state) => {
            const newPaused = !state.isPaused;
            const socket = useSocketStore.getState().socket;
            if (socket) socket.emit('mobile-action', { type: 'set-paused', payload: { paused: newPaused } });
            return { isPaused: newPaused };
        });
    },

    // Explicit action to start timer and sync
    startTimer: (time: number, activeId = null, isEventMode = false) => {
        if (!Number.isFinite(time) || time <= 0) return;
        set({ time, isPaused: false, activeId, isEventMode });
        const socket = useSocketStore.getState().socket;
        if (socket) socket.emit('mobile-action', { type: 'set-timer', payload: { time, activeId, isEventMode } });
    }
}));

