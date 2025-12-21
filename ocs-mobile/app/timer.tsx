import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Play, Pause, Stop, Plus, Trash, Pencil, Check, X, Clock, CaretLeft
} from 'phosphor-react-native';
import { useTimerStore, AgendaItem } from '../store/timerStore';
import { clsx } from 'clsx'; // Assuming standard utility or just conditional string

export default function TimerPage() {
    const router = useRouter();
    const {
        time, agenda, activeId, isPaused, isEventMode,
        setTime, setAgenda, addAgendaItem, deleteAgendaItem, editAgendaItem,
        setActiveId, setIsPaused, setEventMode, togglePause, stopTimer, decrementTime
    } = useTimerStore();

    // Local state for inputs
    const [hours, setHours] = useState('');
    const [minutes, setMinutes] = useState('');
    const [label, setLabel] = useState('');
    const [anchor, setAnchor] = useState('');
    const [eventTime, setEventTime] = useState('');

    // Local state for list item menu
    const [activeMenuId, setActiveMenuId] = useState<number | null>(null);

    // Local state for editing
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editLabel, setEditLabel] = useState('');
    const [editAnchor, setEditAnchor] = useState('');
    const [editTime, setEditTime] = useState(0);

    // Interval Ref
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // --- Timer Logic ---
    const isTimerActive = !isPaused && time > 0;

    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);

        if (isTimerActive) {
            timerRef.current = setInterval(() => {
                decrementTime();
            }, 1000);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isTimerActive]); // Only re-run when pause state or zero-state changes

    // --- Format Helper ---
    const formatTime = (timeToFormat: number) => {
        if (isNaN(timeToFormat)) return "00:00:00";
        let hr = Math.floor(timeToFormat / 3600);
        let min = Math.floor((timeToFormat % 3600) / 60);
        let sec = Math.floor(timeToFormat % 60);
        return `${hr < 10 ? '0' + hr : hr}:${min < 10 ? '0' + min : min}:${sec < 10 ? '0' + sec : sec}`;
    };

    // --- Input Handlers ---
    const handleStartQuick = () => {
        const totalSeconds = (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60;
        if (totalSeconds === 0) return;

        stopTimer(); // specific logic: clear active ID
        setEventMode(false);
        setTime(totalSeconds);
        // inputs remain for potential "Add to list"
    };

    const handleAddToList = () => {
        const totalSeconds = (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60;
        if (totalSeconds === 0) return;

        addAgendaItem({
            _id: Date.now(),
            time: totalSeconds,
            agenda: label || 'Untitled',
            anchor: anchor || 'N/A'
        });

        // Reset inputs
        setHours('');
        setMinutes('');
        setLabel('');
        setAnchor('');
    };

    const handleStartEvent = () => {
        if (!eventTime) return;
        // Basic HH:MM parsing
        const now = new Date();
        const parts = eventTime.split(':');
        if (parts.length < 2) return;

        const h = parseInt(parts[0]);
        const m = parseInt(parts[1]);

        let target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
        if (target < now) {
            target.setDate(target.getDate() + 1);
        }

        const diff = Math.floor((target.getTime() - now.getTime()) / 1000);

        stopTimer();
        setEventMode(true);
        setTime(diff);
    };

    // --- List Item Actions ---
    const handleItemStart = (item: AgendaItem) => {
        stopTimer();
        setTime(item.time);
        setActiveId(item._id);
        setActiveMenuId(null);
    };

    const handleItemAdd1m = (item: AgendaItem) => {
        // Update list item
        editAgendaItem(item._id, { time: item.time + 60 });
        // If active, update running time too
        if (activeId === item._id) {
            setTime(time + 60);
        }
    };

    const handleEditStart = (item: AgendaItem) => {
        setEditingId(item._id);
        setEditLabel(item.agenda);
        setEditAnchor(item.anchor);
        setEditTime(item.time);
        setActiveMenuId(null);
    };

    const handleEditSave = () => {
        if (editingId) {
            editAgendaItem(editingId, { agenda: editLabel, anchor: editAnchor, time: editTime });
            setEditingId(null);
        }
    };

    // --- Render ---
    const isDanger = time <= 10 && time > 0;
    const bgColor = isDanger ? 'bg-red-600' : 'bg-green-600'; // Simplifying desktop gradients/colors to solid for clarity first

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <SafeAreaView className="flex-1 bg-[#121212]">
                <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>

                    {/* Header */}
                    <View className="flex-row items-center px-4 py-3 border-b border-white/10 mb-4">
                        <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2 bg-white/10 rounded-full">
                            <CaretLeft color="white" size={20} />
                        </TouchableOpacity>
                        <Text className="text-white text-xl font-bold">Timer Controller</Text>
                    </View>

                    {/* Preview Section */}
                    <View className={`mx-4 rounded-3xl p-6 items-center justify-center mb-6 relative overflow-hidden ${isDanger ? 'bg-red-600' : 'bg-[#11998e]'}`}>
                        <Text className="text-white/80 text-sm font-bold uppercase tracking-widest mb-2">Current Timer</Text>
                        <Text className="text-white text-6xl font-black font-monospaced tracking-tighter">
                            {formatTime(time)}
                        </Text>

                        {/* Controls */}
                        {time > 0 && (
                            <View className="flex-row gap-4 mt-6">
                                <TouchableOpacity onPress={togglePause} className="w-14 h-14 bg-black/20 rounded-full items-center justify-center border border-white/20">
                                    {isPaused ? <Play color="white" weight="fill" size={24} /> : <Pause color="white" weight="fill" size={24} />}
                                </TouchableOpacity>
                                <TouchableOpacity onPress={stopTimer} className="w-14 h-14 bg-black/20 rounded-full items-center justify-center border border-white/20">
                                    <Stop color="white" weight="fill" size={24} />
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {/* Input Section */}
                    <View className="mx-4 bg-white/5 rounded-2xl p-5 mb-6 border border-white/10">
                        {/* Time Inputs */}
                        <View className="flex-row gap-4 mb-4">
                            <View className="flex-1 items-center bg-black/20 rounded-xl p-3 border border-white/5">
                                <TextInput
                                    value={hours}
                                    onChangeText={setHours}
                                    keyboardType="number-pad"
                                    className="text-white text-4xl font-bold text-center w-full"
                                    placeholder="00"
                                    placeholderTextColor="#555"
                                    maxLength={2}
                                />
                                <Text className="text-white/40 text-xs font-bold uppercase mt-1">Hours</Text>
                            </View>
                            <Text className="text-white/20 text-4xl font-bold self-center">:</Text>
                            <View className="flex-1 items-center bg-black/20 rounded-xl p-3 border border-white/5">
                                <TextInput
                                    value={minutes}
                                    onChangeText={setMinutes}
                                    keyboardType="number-pad"
                                    className="text-white text-4xl font-bold text-center w-full"
                                    placeholder="00"
                                    placeholderTextColor="#555"
                                    maxLength={2}
                                />
                                <Text className="text-white/40 text-xs font-bold uppercase mt-1">Minutes</Text>
                            </View>
                        </View>

                        {/* Text Inputs */}
                        <View className="gap-3 mb-4">
                            <TextInput
                                value={label}
                                onChangeText={setLabel}
                                placeholder="Label (e.g. Worship)"
                                placeholderTextColor="#666"
                                className="bg-black/20 text-white p-4 rounded-xl border border-white/5"
                            />
                            <TextInput
                                value={anchor}
                                onChangeText={setAnchor}
                                placeholder="Anchor (Person in charge)"
                                placeholderTextColor="#666"
                                className="bg-black/20 text-white p-4 rounded-xl border border-white/5"
                            />
                        </View>

                        {/* Buttons */}
                        <View className="flex-row gap-3">
                            <TouchableOpacity onPress={handleStartQuick} className="flex-1 bg-white/10 p-4 rounded-xl items-center active:bg-white/20">
                                <Text className="text-white font-bold">Quick Start</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleAddToList} className="flex-1 bg-[#38ef7d] p-4 rounded-xl items-center active:opacity-90">
                                <Text className="text-black font-bold">Add to List</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Event Time (Optional/Advanced) */}
                        <View className="mt-4 pt-4 border-t border-white/10 flex-row gap-3">
                            <TextInput
                                value={eventTime}
                                onChangeText={setEventTime}
                                placeholder="HH:MM (24h)"
                                placeholderTextColor="#666"
                                className="flex-1 bg-black/20 text-white p-3 rounded-lg border border-white/5 text-center"
                            />
                            <TouchableOpacity onPress={handleStartEvent} className="bg-blue-600 px-4 justify-center rounded-lg">
                                <Text className="text-white font-bold text-xs uppercase">Event Start</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Agenda List */}
                    <View className="mx-4">
                        <Text className="text-white/50 text-xs font-bold uppercase tracking-widest mb-3 ml-1">Agenda</Text>

                        {agenda.length === 0 ? (
                            <View className="p-8 items-center bg-white/5 rounded-2xl border-dashed border border-white/10">
                                <Clock size={32} color="#444" weight="duotone" />
                                <Text className="text-white/30 mt-2">No timers added yet</Text>
                            </View>
                        ) : (
                            agenda.map((item) => {
                                const isActive = activeId === item._id;
                                const isMenuOpen = activeMenuId === item._id;
                                const isEditing = editingId === item._id;

                                if (isEditing) {
                                    return (
                                        <View key={item._id} className="bg-white/10 p-4 rounded-2xl mb-3 border border-white/20">
                                            <TextInput
                                                value={editLabel} onChangeText={setEditLabel}
                                                className="bg-black/20 text-white p-3 rounded-lg mb-2"
                                                placeholder="Label"
                                            />
                                            <TextInput
                                                value={editAnchor} onChangeText={setEditAnchor}
                                                className="bg-black/20 text-white p-3 rounded-lg mb-2"
                                                placeholder="Anchor"
                                            />
                                            <View className="flex-row justify-end gap-2">
                                                <TouchableOpacity onPress={handleEditSave} className="p-2 bg-green-500 rounded-lg"><Check color="white" /></TouchableOpacity>
                                                <TouchableOpacity onPress={() => setEditingId(null)} className="p-2 bg-red-500 rounded-lg"><X color="white" /></TouchableOpacity>
                                            </View>
                                        </View>
                                    )
                                }

                                return (
                                    <View key={item._id} className={`mb-3 rounded-2xl overflow-hidden ${isActive ? 'bg-white/10 border border-[#38ef7d]/50' : 'bg-white/5 border border-white/5'}`}>
                                        <TouchableOpacity
                                            className="p-4 flex-row justify-between items-center"
                                            onPress={() => setActiveMenuId(isMenuOpen ? null : item._id)}
                                            activeOpacity={0.8}
                                        >
                                            <View className="flex-1">
                                                <Text className={`text-white font-bold text-lg ${isActive ? 'text-[#38ef7d]' : ''}`}>{item.agenda}</Text>
                                                <Text className="text-white/50 text-sm">{item.anchor}</Text>
                                            </View>
                                            <Text className="text-white font-mono font-bold text-xl">{formatTime(item.time)}</Text>
                                        </TouchableOpacity>

                                        {/* Action Menu */}
                                        {isMenuOpen && (
                                            <View className={`flex-row justify-around p-3 bg-black/20 border-t ${isActive ? 'border-[#38ef7d]/20' : 'border-white/5'}`}>
                                                <ActionBtn icon={Play} label="Start" color="bg-green-600" onPress={() => handleItemStart(item)} />
                                                <ActionBtn icon={Plus} label="+1m" color="bg-blue-600" onPress={() => handleItemAdd1m(item)} />
                                                <ActionBtn icon={Pencil} label="Edit" color="bg-yellow-600" onPress={() => handleEditStart(item)} />
                                                <ActionBtn icon={Trash} label="Del" color="bg-red-600" onPress={() => deleteAgendaItem(item._id)} />
                                            </View>
                                        )}
                                    </View>
                                );
                            })
                        )}
                    </View>

                </ScrollView>
            </SafeAreaView>
        </>
    );
}

const ActionBtn = ({ icon: Icon, label, color, onPress }: any) => (
    <TouchableOpacity onPress={onPress} className="items-center gap-1">
        <View className={`w-10 h-10 ${color} rounded-full items-center justify-center shadow-sm`}>
            <Icon color="white" weight="fill" size={18} />
        </View>
        <Text className="text-white/60 text-[10px] uppercase font-bold">{label}</Text>
    </TouchableOpacity>
);
