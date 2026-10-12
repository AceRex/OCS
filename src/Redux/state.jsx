import { createSlice } from "@reduxjs/toolkit";

const utilSlice = createSlice({
  name: "util",
  initialState: {
    setTime: false,
    time: 0,
    timerRevision: 0,
    agenda: [],
    isEventMode: false,
    isPaused: false,
    isRunning: false,
    activeId: null,
    theme: "default",
    nextStartInterval: 0,
    delayCountdown: 0,
    isDelayRunning: false,
    nextItemToStart: null,
    loadedAgenda: null,
  },
  reducers: {
    startTimer: (state, action) => {
      const seconds = Number(action.payload.time);
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      state.time = Math.ceil(seconds);
      state.timerRevision += 1;
      state.activeId = action.payload.activeId ?? null;
      state.isEventMode = Boolean(action.payload.isEventMode);
      state.isPaused = false;
      state.isRunning = true;
      state.isDelayRunning = false;
      state.delayCountdown = 0;
      state.nextItemToStart = null;
    },
    clearTimer: (state) => {
      state.time = 0;
      state.isRunning = false;
      state.isPaused = false;
      state.isEventMode = false;
      state.activeId = null;
      state.isDelayRunning = false;
      state.delayCountdown = 0;
      state.nextItemToStart = null;
    },
    setIsRunning: (state, action) => {
      state.isRunning = Boolean(action.payload);
    },
    setLoadedAgenda: (state, action) => {
      state.loadedAgenda = action.payload;
      state.isRunning = false;
      if (action.payload && Array.isArray(action.payload.sessions)) {
        // Sync sessions into state.agenda for full backward compatibility
        state.agenda = action.payload.sessions.map((s, idx) => ({
          _id: s.id || `sess_${idx}`,
          time: s.durationSec || 300,
          agenda: s.name || `Session ${idx + 1}`,
          anchor: s.person || s.speakerName || '',
          intervalSec: s.intervalSec || 0,
          transitionMode: s.transitionMode || 'manual',
        }));
      }
    },
    clearLoadedAgenda: (state) => {
      state.loadedAgenda = null;
    },
    setTheme: (state, action) => {
      state.theme = action.payload;
    },
    setActiveId: (state, action) => {
      state.activeId = action.payload;
    },
    setEventMode: (state, action) => {
      state.isEventMode = action.payload;
    },
    setPaused: (state, action) => {
      state.isPaused = action.payload;
    },
    setTimeState: (state, action) => {
      state.setTime = action.payload;
    },
    setTime: (state, action) => {
      state.time = action.payload;
    },
    setNextStartInterval: (state, action) => {
      state.nextStartInterval = action.payload;
    },
    setDelayCountdown: (state, action) => {
      state.delayCountdown = action.payload;
    },
    setIsDelayRunning: (state, action) => {
      state.isDelayRunning = action.payload;
    },
    setNextItemToStart: (state, action) => {
      state.nextItemToStart = action.payload;
    },
    setAgenda: (state, action) => {
      const newAgenda = action.payload;
      state.agenda.push({
        _id: newAgenda._id,
        time: newAgenda.time,
        agenda: newAgenda.agenda,
        anchor: newAgenda.anchor,
      });
    },
    editAgenda: (state, action) => {
      const { _id, ...updates } = action.payload;
      const index = state.agenda.findIndex((item) => item._id === _id);
      if (index !== -1) {
        state.agenda[index] = { ...state.agenda[index], ...updates };
      }
    },
    delAgenda(state, action) {
      const existingItem = state.agenda.find(
        (item) => item._id === action.payload.id
      );
      if (existingItem) {
        state.agenda = state.agenda.filter(
          (item) => item._id !== action.payload.id
        );
      }
    },
  },
});

export const utilAction = utilSlice.actions;

export default utilSlice;
