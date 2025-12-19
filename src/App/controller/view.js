import React, { useState } from "react";
import Sidebar from "./Sidebar";
import TimerController from "./TimerController";
import BibleController from "./BibleController";
import PresentationController from "./PresentationController";

function App() {
  const [activeTab, setActiveTab] = useState('timer');

  return (
    <section className="w-[100vw] h-[100vh] flex flex-row bg-primary overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 h-full overflow-hidden p-4 relative">
        <div className={`w-full h-full ${activeTab === 'timer' ? 'block' : 'hidden'}`}>
          <TimerController />
        </div>
        <div className={`w-full h-full ${activeTab === 'bible' ? 'block' : 'hidden'}`}>
          <BibleController />
        </div>
        <div className={`w-full h-full ${activeTab === 'presentation' ? 'block' : 'hidden'}`}>
          <PresentationController />
        </div>
        <div className={`w-full h-full ${activeTab === 'apps' ? 'block' : 'hidden'}`}>
          <div className="text-light p-10">Select a module</div>
        </div>
      </main>
    </section>
  );
}

export default App;
