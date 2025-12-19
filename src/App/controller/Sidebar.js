import React from 'react';
import {
    PiClock, PiBook, PiMonitor, PiSquaresFour, PiHouse,
    PiMusicNotes, PiMicrophone, PiCamera, PiBroadcast, PiGear
} from "react-icons/pi";

export default function Sidebar({ activeTab, onTabChange }) {
    const tabs = [
        { id: 'dashboard', label: 'Home', icon: PiHouse },
        { id: 'timer', label: 'Timer', icon: PiClock },
        { id: 'bible', label: 'Bible', icon: PiBook },
        { id: 'presentation', label: 'Present', icon: PiMonitor },
        { id: 'songs', label: 'Songs', icon: PiMusicNotes },
        { id: 'intercom', label: 'Talk', icon: PiMicrophone },
        { id: 'camera', label: 'Cam', icon: PiCamera },
        { id: 'stream', label: 'Live', icon: PiBroadcast },
        { id: 'settings', label: 'Settings', icon: PiGear },
        { id: 'apps', label: 'More', icon: PiSquaresFour },
    ];

    return (
        <aside className="w-20 h-full bg-[#1e1e1e] flex flex-col items-center py-2 overflow-hidden">
            {/* <div className="text-light/50 text-xs font-bold uppercase tracking-widest mb-2">OCS</div> */}
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        className={`flex-1 flex flex-col items-center justify-center w-full transition-all group min-h-0`}
                    >
                        <div className={`flex flex-col items-center justify-center w-full h-full ${isActive ? 'border-r-light border-r-2 bg-ash/20' : 'border-r- border-r-0'}  transition-colors`}>
                            <div className={`p-1 transition-colors ${isActive ? 'text-light' : ' text-ash group-hover:bg-white/10 group-hover:text-gray-200'}`}>
                                <Icon size={20} className="shrink-0" />
                            </div>
                            <span className={`text-[9px] font-medium leading-none mt-1 ${isActive ? 'text-light' : 'text-ash group-hover:text-gray-300'}`}>
                                {tab.label}
                            </span>
                        </div>
                    </button>
                );
            })}
        </aside>
    );
}
