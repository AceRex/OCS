import { create } from 'zustand';

export interface AgendaItem {
    _id: number;
    time: number;
    agenda: string;
    anchor: string;
}

interface TimerState {
    time: number;
    agenda: AgendaItem[];
    activeId: number | null;
    isPaused: boolean;
    isEventMode: boolean;
    theme: string;

    // Actions
    setTime: (time: number) => void;
    setAgenda: (agenda: AgendaItem[]) => void;
    addAgendaItem: (item: AgendaItem) => void;
    deleteAgendaItem: (id: number) => void;
    editAgendaItem: (id: number, updates: Partial<AgendaItem>) => void;
    setActiveId: (id: number | null) => void;
    setIsPaused: (isPaused: boolean) => void;
    setEventMode: (isEventMode: boolean) => void;
    setTheme: (theme: string) => void;
    decrementTime: () => void;

    // Composite actions
    stopTimer: () => void;
    togglePause: () => void;
}

export const useTimerStore = create<TimerState>((set) => ({
    time: 0,
    agenda: [],
    activeId: null,
    isPaused: false,
    isEventMode: false,
    theme: 'default',

    setTime: (time) => set({ time }),
    setAgenda: (agenda) => set({ agenda }),
    addAgendaItem: (item) => set((state) => ({ agenda: [...state.agenda, item] })),
    deleteAgendaItem: (id) => set((state) => ({ agenda: state.agenda.filter(i => i._id !== id) })),
    editAgendaItem: (id, updates) => set((state) => ({
        agenda: state.agenda.map(i => i._id === id ? { ...i, ...updates } : i)
    })),
    setActiveId: (activeId) => set({ activeId }),
    setIsPaused: (isPaused) => set({ isPaused }),
    setEventMode: (isEventMode) => set({ isEventMode }),
    setTheme: (theme) => set({ theme }),
    decrementTime: () => set((state) => ({ time: Math.max(0, state.time - 1) })),

    stopTimer: () => set({ time: 0, activeId: null, isPaused: false, isEventMode: false }),
    togglePause: () => set((state) => ({ isPaused: !state.isPaused })),
}));

