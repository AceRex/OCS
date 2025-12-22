import React, { useState } from "react";
import Sidebar from "./Sidebar";
import TimerController from "./TimerController";
import BibleController from "./BibleController";
import PresentationController from "./PresentationController";
import SettingsController from "./SettingsController";

import Dashboard from "./Dashboard";
import Topbar from "./Topbar";
import PreviewModal from "./PreviewModal";

import MobileConnectController from "./MobileConnectController";

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [previewMode, setPreviewMode] = useState(null); // 'speaker', 'general', or null

  return (
    <section className="w-[100vw] h-[100vh] flex flex-row bg-primary overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 h-full flex flex-col overflow-hidden relative">
        <Topbar
          onGoLive={() => setPreviewMode('speaker')} // Default to speaker for Go Live? Or remove? Topbar.js uses this differently.
          previewMode={previewMode}
          onSetPreviewMode={setPreviewMode}
        />

        <div className="flex-1 overflow-hidden p-4 relative">
          <div className={`w-full h-full ${activeTab === 'dashboard' ? 'block' : 'hidden'}`}>
            <Dashboard onNavigate={setActiveTab} />
          </div>
          <div className={`w-full h-full ${activeTab === 'timer' ? 'block' : 'hidden'}`}>
            <TimerController />
          </div>
          <div className={`w-full h-full ${activeTab === 'bible' ? 'block' : 'hidden'}`}>
            <BibleController />
          </div>
          <div className={`w-full h-full ${activeTab === 'presentation' ? 'block' : 'hidden'}`}>
            <PresentationController />
          </div>

          {/* New Modules Placeholders */}
          <div className={`w-full h-full ${activeTab === 'songs' ? 'block' : 'hidden'} flex items-center justify-center`}>
            <div className="text-light text-xl opacity-50 flex flex-col items-center gap-4">
              <div className="p-4 bg-white/10 rounded-full"><span className="text-4xl">🎵</span></div>
              Song Lyrics Module Coming Soon
            </div>
          </div>
          <div className={`w-full h-full ${activeTab === 'intercom' ? 'block' : 'hidden'} flex items-center justify-center`}>
            <div className="text-light text-xl opacity-50 flex flex-col items-center gap-4">
              <div className="p-4 bg-white/10 rounded-full"><span className="text-4xl">🎙️</span></div>
              Walkie-Talkie Module Coming Soon
            </div>
          </div>
          <div className={`w-full h-full ${activeTab === 'camera' ? 'block' : 'hidden'} flex items-center justify-center`}>
            <div className="text-light text-xl opacity-50 flex flex-col items-center gap-4">
              <div className="p-4 bg-white/10 rounded-full"><span className="text-4xl">📷</span></div>
              Camera Integration Coming Soon
            </div>
          </div>
          <div className={`w-full h-full ${activeTab === 'stream' ? 'block' : 'hidden'} flex items-center justify-center`}>
            <div className="text-light text-xl opacity-50 flex flex-col items-center gap-4">
              <div className="p-4 bg-white/10 rounded-full"><span className="text-4xl">📡</span></div>
              Live Stream Module Coming Soon
            </div>
          </div>

          <div className={`w-full h-full ${activeTab === 'mobile' ? 'block' : 'hidden'}`}>
            <MobileConnectController />
          </div>

          <div className={`w-full h-full ${activeTab === 'settings' ? 'block' : 'hidden'}`}>
            <SettingsController />
          </div>

          <div className={`w-full h-full ${activeTab === 'apps' ? 'block' : 'hidden'}`}>
            <div className="text-light p-10">Select a module</div>
          </div>
        </div>

        <PreviewModal
          isOpen={!!previewMode}
          mode={previewMode}
          onClose={() => setPreviewMode(null)}
        />
      </main>
    </section>
  );
}

export default App;
