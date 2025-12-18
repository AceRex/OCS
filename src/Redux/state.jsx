import { createSlice } from "@reduxjs/toolkit";

const utilSlice = createSlice({
  name: "util",
  initialState: {
    setTime: false,
    time: 0,
    agenda: [],
    isEventMode: false,
  },
  reducers: {
    setEventMode: (state, action) => {
      state.isEventMode = action.payload;
    },
    setTimeState: (state, action) => {
      state.setTime = action.payload;
    },
    setTime: (state, action) => {
      state.time = action.payload;
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
    delAgenda(state, action) {
      const existingItem = state.agenda.find(
        (item) => item._id === action.payload.id
      );
      console.log(existingItem);
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
