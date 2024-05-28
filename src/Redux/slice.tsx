import { configureStore } from "@reduxjs/toolkit";
import utilSlice from "./state";

const store = configureStore({
  reducer: {
    util: utilSlice.reducer,
  },
});

export default store;
