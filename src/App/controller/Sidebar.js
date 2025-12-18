import React from 'react';
import { PiClock, PiBook, PiMonitor, PiSquaresFour } from "react-icons/pi";

export default function Sidebar({ activeTab, onTabChange }) {
    const tabs = [
        { id: 'timer', label: 'Timer', icon: PiClock },
        { id: 'bible', label: 'Bible', icon: PiBook },
        { id: 'presentation', label: 'Presentation', icon: PiMonitor },
        { id: 'apps', label: 'More', icon: PiSquaresFour },
    ];

    return (
        <aside className="w-20 h-full bg-[#1e1e1e] flex flex-col items-center justify-center py-6">
            {/* <div className="text-light/50 text-xs font-bold uppercase tracking-widest mb-2">OCS</div> */}
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        className={`flex flex-col items-center justify-center gap-1 w-full transition-all group`}
                    >
                        {/* {isActive && <div className=" h-8 " />} */}
                        <div className={`flex flex-col items-center p-4 justify-center w-full gap-2 ${isActive ? 'border-r-light border-r-2 bg-ash/20' : 'border-r- border-r-0'}  transition-colors`}>
                            <div className={`p-2 transition-colors  ${isActive ? 'text-light' : ' text-ash group-hover:bg-white/10 group-hover:text-gray-200'}`}>
                                <Icon size={24} />
                            </div>
                            <span className={`text-[10px] font-medium ${isActive ? 'text-light' : 'text-ash group-hover:text-gray-300'}`}>
                                {tab.label}
                            </span>
                        </div>
                    </button>
                );
            })}
        </aside>
    );
}
