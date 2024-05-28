import { createSlice } from "@reduxjs/toolkit";

const utilSlice = createSlice({
  name: "util",
  initialState: {
    setTime: false,
    time: 0,
    agenda: [],
  },
  reducers: {
    setTimeState: (state, action) => {
      state.setTime = action.payload;
    },
    setTime: (state, action) => {
      state.time = action.payload;
    },
    setAgenda: (state, action) => {
      const newAgenda = action.payload;
      state.agenda.push({
        time: newAgenda.time,
        agenda: newAgenda.agenda,
        anchor: newAgenda.anchor,
      });
    },
  },
});

export const utilAction = utilSlice.actions;

export default utilSlice;
