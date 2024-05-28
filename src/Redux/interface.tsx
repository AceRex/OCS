export interface Rootstate {
  util: {
    setTime: boolean;
    time: string;
    agenda: [time: string, label: string, anchor: string];
  };
}
