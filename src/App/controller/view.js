import React, { useState } from "react";
import Sidebar from "./Sidebar";
import TimerController from "./TimerController";
import BibleController from "./BibleController";
import PresentationController from "./PresentationController";

function App() {
  const [activeTab, setActiveTab] = useState('timer');

  const renderContent = () => {
    switch (activeTab) {
      case 'timer':
        return <TimerController />;
      case 'bible':
        return <BibleController />;
      case 'presentation':
        return <PresentationController />;
      default:
        return <div className="text-light p-10">Select a module</div>;
    }
  };

  return (
    <section className="w-[100vw] h-[100vh] flex flex-row bg-primary overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 h-full overflow-hidden p-4">
        {renderContent()}
      </main>
    </section>
  );
}

export default App;
