
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useBibleStore, BibleBook } from '../store/bibleStore';
import { useSocketStore } from '../store/socketStore';
import { CaretDown, CaretLeft, Check } from 'phosphor-react-native';

export default function BibleScreen() {
    const {
        books, verses, selectedVersion, selectedBookIndex, selectedChapterIndex,
        setBooks, setVerses, fetchBooks, fetchChapter, presentVerse, setSelection
    } = useBibleStore();
    const { socket } = useSocketStore();

    // UI State for Modals
    const [showBooks, setShowBooks] = useState(false);
    const [showChapters, setShowChapters] = useState(false);
    const [showVersions, setShowVersions] = useState(false);

    // Initial Fetch
    useEffect(() => {
        if (socket) {
            // Request books
            fetchBooks();

            // Listen for data
            const onData = (data: any) => {
                if (data.type === 'bible-books') {
                    setBooks(data.payload);
                    // Initial load of Genesis 1
                    if (data.payload.length > 0) {
                        // Default to Genesis 1 if not set? 
                        // Store has 0,0 default.
                        fetchChapter('kjv', 0, 0);
                    }
                }
                if (data.type === 'bible-chapter') {
                    setVerses(data.payload);
                }
            };

            socket.on('mobile-data', onData);
            return () => { socket.off('mobile-data', onData); };
        }
    }, [socket]);

    // Handlers
    const handleBookSelect = (index: number) => {
        setSelection(selectedVersion, index, 0); // Reset to chapter 1
        setShowBooks(false);
        fetchChapter(selectedVersion, index, 0);
    };

    const handleChapterSelect = (index: number) => {
        setSelection(selectedVersion, selectedBookIndex, index);
        setShowChapters(false);
        fetchChapter(selectedVersion, selectedBookIndex, index);
    };

    const handleVersionSelect = (ver: string) => {
        setSelection(ver, selectedBookIndex, selectedChapterIndex);
        setShowVersions(false);
        fetchChapter(ver, selectedBookIndex, selectedChapterIndex);
    };

    const handleVersePress = (index: number, text: string) => {
        // Optimistic sync? We just send command.
        presentVerse(index, text);
        // Note: We don't track "selected" state locally in store yet for highlighting, 
        // but can add local state here if needed. 
        // For now, it's a remote controller.
    };

    const currentBook = books[selectedBookIndex];
    const chapterCount = currentBook ? currentBook.chapters : 50; // Fallback? 
    // Wait, desktop didn't send chapter count in 'books' query? 
    // Desktop 'books' table usually has 'chapters' column?
    // Let's assume it does. If not, we might need a fixed list or logic.
    // Inspecting 'main.js' ... it does `select * from books`.
    // If 'chapters' column exists, good.
    // If not, we might check desktop code... 
    // Desktop `BibleController` hardcodes 150 chapters in dropdown! 
    // "Array.from({ length: 150 }..."
    // So we should do the same for safety.

    const chapters = Array.from({ length: 150 }, (_, i) => i + 1);

    const versions = {
        kjv: "KJV",
        bbe: "BBE",
        asv: "ASV",
        web: "WEB",
        net: "NET",
        // Add others if needed
    };

    return (
        <SafeAreaView className="flex-1 bg-[#121212]">
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header */}
            <View className="p-4 border-b border-white/10 bg-[#1a1a1a]">
                <Text className="text-white text-xl font-bold mb-4">Bible Controller</Text>

                {/* Selectors Row */}
                <View className="flex-row gap-2">
                    {/* Version */}
                    <TouchableOpacity onPress={() => setShowVersions(true)} className="flex-1 bg-white/5 p-3 rounded-lg border border-white/10 flex-row justify-between items-center">
                        <Text className="text-white font-bold uppercase text-xs">{versions[selectedVersion as keyof typeof versions] || selectedVersion}</Text>
                        <CaretDown color="white" size={12} />
                    </TouchableOpacity>

                    {/* Book */}
                    <TouchableOpacity onPress={() => setShowBooks(true)} className="flex-[2] bg-white/5 p-3 rounded-lg border border-white/10 flex-row justify-between items-center">
                        <Text className="text-white font-bold text-sm truncate" numberOfLines={1}>
                            {currentBook ? currentBook.name : 'Loading...'}
                        </Text>
                        <CaretDown color="white" size={12} />
                    </TouchableOpacity>

                    {/* Chapter */}
                    <TouchableOpacity onPress={() => setShowChapters(true)} className="flex-[1] bg-white/5 p-3 rounded-lg border border-white/10 flex-row justify-between items-center">
                        <Text className="text-white font-bold text-sm">{selectedChapterIndex + 1}</Text>
                        <CaretDown color="white" size={12} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Verses List */}
            <FlatList
                data={verses}
                keyExtractor={(_, i) => i.toString()}
                contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                renderItem={({ item, index }) => (
                    <TouchableOpacity
                        onPress={() => handleVersePress(index, item)}
                        className="flex-row mb-4 active:bg-white/5 p-2 rounded-lg"
                    >
                        <Text className="text-[#38ef7d] font-bold w-8 pt-1 text-xs">{index + 1}</Text>
                        <Text className="text-white/90 text-lg flex-1 leading-6">{item}</Text>
                    </TouchableOpacity>
                )}
                ListEmptyComponent={<Text className="text-white/30 text-center mt-10">Loading / No Verses...</Text>}
            />

            {/* Modals */}
            <SelectionModal
                visible={showBooks}
                onClose={() => setShowBooks(false)}
                title="Select Book"
            >
                <FlatList
                    data={books}
                    keyExtractor={(item) => item.abbrev}
                    renderItem={({ item, index }) => (
                        <TouchableOpacity
                            onPress={() => handleBookSelect(index)}
                            className={`p-4 border-b border-white/5 flex-row justify-between ${index === selectedBookIndex ? 'bg-white/10' : ''}`}
                        >
                            <Text className={`text-lg ${index === selectedBookIndex ? 'text-[#38ef7d] font-bold' : 'text-white'}`}>{item.name}</Text>
                            {index === selectedBookIndex && <Check color="#38ef7d" size={20} />}
                        </TouchableOpacity>
                    )}
                />
            </SelectionModal>

            <SelectionModal
                visible={showChapters}
                onClose={() => setShowChapters(false)}
                title="Select Chapter"
            >
                <FlatList
                    data={chapters}
                    numColumns={5}
                    keyExtractor={(item) => item.toString()}
                    contentContainerStyle={{ padding: 10 }}
                    renderItem={({ item, index }) => (
                        <TouchableOpacity
                            onPress={() => handleChapterSelect(index)}
                            className={`flex-1 m-1 aspect-square items-center justify-center rounded-lg border ${index === selectedChapterIndex ? 'bg-[#38ef7d] border-[#38ef7d]' : 'bg-white/5 border-white/10'}`}
                        >
                            <Text className={`font-bold ${index === selectedChapterIndex ? 'text-black' : 'text-white'}`}>{item}</Text>
                        </TouchableOpacity>
                    )}
                />
            </SelectionModal>

            <SelectionModal
                visible={showVersions}
                onClose={() => setShowVersions(false)}
                title="Select Version"
            >
                {Object.entries(versions).map(([key, name]) => (
                    <TouchableOpacity
                        key={key}
                        onPress={() => handleVersionSelect(key)}
                        className={`p-4 border-b border-white/5 flex-row justify-between ${key === selectedVersion ? 'bg-white/10' : ''}`}
                    >
                        <Text className={`text-lg ${key === selectedVersion ? 'text-[#38ef7d] font-bold' : 'text-white'}`}>{name} ({key.toUpperCase()})</Text>
                    </TouchableOpacity>
                ))}
            </SelectionModal>

        </SafeAreaView>
    );
}

const SelectionModal = ({ visible, onClose, title, children }: any) => (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
        <View className="flex-1 bg-black/80 justify-end">
            <View className="h-[80%] bg-[#1a1a1a] rounded-t-3xl overflow-hidden">
                <View className="p-4 border-b border-white/10 flex-row justify-between items-center bg-[#252525]">
                    <Text className="text-white font-bold text-lg">{title}</Text>
                    <TouchableOpacity onPress={onClose} className="p-2 bg-white/10 rounded-full">
                        <CaretDown color="white" size={20} />
                    </TouchableOpacity>
                </View>
                {children}
            </View>
        </View>
    </Modal>
);

