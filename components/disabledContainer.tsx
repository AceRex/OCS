import React from "react";
import { PiEmpty } from "react-icons/pi";

export default function DisabledContainer({
  children,
  disabled,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  if (!disabled) {
    return <>{children}</>;
  }
  return (
    <div className="bg-ash/20 w-full h-full cursor-not-allowed">
      <div className="w-full h-full relative">
        <div className="absolute z-99 h-full w-full">
          <div className="h-full w-full flex flex-col items-center justify-center ">
            <PiEmpty size={30} className="text-white/50" />
            <p className="text-white/50">This feature is not available.</p>
          </div>
        </div>
        <div className="bg-primary/50 blur-sm backdrop-blur-sm">{children}</div>
      </div>
    </div>
  );
}
