export interface Rootstate {
  util: {
    setTime: boolean;
    time: number;
    agenda: [time: string, label: string, anchor: string];
  };
}
