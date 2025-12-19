import React from 'react';
import {
    PiClock, PiBook, PiMonitor, PiSquaresFour,
    PiMusicNotes, PiMicrophone, PiCamera, PiBroadcast, PiGear,
    PiHouse
} from "react-icons/pi";

export default function Dashboard({ onNavigate }) {
    const cards = [
        {
            id: 'timer',
            label: 'Timer Sync',
            icon: PiClock,
            gradient: 'from-[#FF9966] to-[#FF5E62]',
            description: 'Admin-controlled distributed timer system'
        },
        {
            id: 'bible',
            label: 'AI Bible',
            icon: PiBook,
            gradient: 'from-[#56CCF2] to-[#2F80ED]',
            description: 'Intelligent scripture lookup & display'
        },
        {
            id: 'presentation',
            label: 'Presentation',
            icon: PiMonitor,
            gradient: 'from-[#EC008C] to-[#FC6767]',
            description: 'Dynamic slides with media backgrounds'
        },
        {
            id: 'songs',
            label: 'Song Lyrics',
            icon: PiMusicNotes,
            gradient: 'from-[#8E2DE2] to-[#4A00E0]',
            description: 'Lyric projection with auto-load'
        },
        {
            id: 'intercom',
            label: 'Walkie-Talkie',
            icon: PiMicrophone,
            gradient: 'from-[#00b09b] to-[#96c93d]',
            description: 'Push-to-talk team communication'
        },
        {
            id: 'camera',
            label: 'Cameras',
            icon: PiCamera,
            gradient: 'from-[#43cea2] to-[#185a9d]',
            description: 'USB & Mobile camera integration'
        },
        {
            id: 'stream',
            label: 'Live Stream',
            icon: PiBroadcast,
            gradient: 'from-[#D31027] to-[#EA384D]',
            description: 'RTMP Streaming & Scene management'
        },
        {
            id: 'settings',
            label: 'Settings',
            icon: PiGear,
            gradient: 'from-[#636FA4] to-[#E8CBC0]',
            description: 'System personalization and calibration'
        },
        {
            id: 'apps',
            label: 'More Apps',
            icon: PiSquaresFour,
            gradient: 'from-[#34e89e] to-[#0f3443]',
            description: 'Additional tools and settings'
        },
    ];

    return (
        <div className="flex flex-col gap-6 p-4 text-light h-full overflow-y-auto">
            <h2 className="text-xl font-bold text-ash uppercase tracking-widest flex items-center gap-2">
                <PiHouse className="mb-1" /> Dashboard
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {cards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div
                            key={card.id}
                            onClick={() => onNavigate(card.id)}
                            className={`relative h-48 rounded-3xl p-6 cursor-pointer hover:scale-[1.02] transition-transform shadow-lg bg-gradient-to-br ${card.gradient} flex flex-col justify-between overflow-hidden group`}
                        >
                            <div className="absolute right-[-20px] bottom-[-20px] opacity-20 transform rotate-12 group-hover:scale-110 transition-transform">
                                <Icon size={150} color="white" />
                            </div>

                            <div className="z-10">
                                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center mb-4 text-white">
                                    <Icon size={40} />
                                </div>
                                <h2 className="text-2xl font-bold text-white">{card.label}</h2>
                            </div>

                            <div className="z-10">
                                <p className="text-white/80 text-sm font-medium">{card.description}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
