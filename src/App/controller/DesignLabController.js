import React from "react";
import LiveDesignStudioModal from "./LiveDesignStudioModal";
import DisabledContainer from "../components/DisabledContainer";

export default function DesignLabController() {
  return (
    <DisabledContainer
      featureName="Design Studio"
      description="Log in to unlock AI-assisted graphic design, poster analysis, and media generation."
    >
      <div className="w-full h-full relative overflow-hidden bg-[#0d0b14]">
        <LiveDesignStudioModal
          isOpen={true}
          embedded={true}
          initialToolTab="lab"
        />
      </div>
    </DisabledContainer>
  );
}
