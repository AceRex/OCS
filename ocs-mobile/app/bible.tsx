import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Modal, TextInput, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useBibleStore, BibleBook } from '../store/bibleStore';
import { useSocketStore } from '../store/socketStore';
import { CaretDown, CaretLeft, Check, MagnifyingGlass, X, Link as LinkIcon, LinkBreak, Broadcast } from 'phosphor-react-native';

export default function BibleScreen() {
    const router = useRouter();
    const {
        books, verses, selectedVersion, selectedBookIndex, selectedChapterIndex,
        setBooks, setVerses, fetchBooks, fetchChapter, presentVerse, setSelection
    } = useBibleStore();
    const { socket } = useSocketStore();

    // UI State for Modals & Logic
    const [showBooks, setShowBooks] = useState(false);
    const [showChapters, setShowChapters] = useState(false);
    const [showVersesModal, setShowVersesModal] = useState(false);
    const [showVersions, setShowVersions] = useState(false);

    const [isSyncEnabled, setIsSyncEnabled] = useState(false); // Default Standalone
    const [confirmingVerse, setConfirmingVerse] = useState<{ index: number, text: string } | null>(null);

    const flatListRef = React.useRef<FlatList>(null);

    // Initial Fetch & Sync Listener
    useEffect(() => {
        if (socket) {
            // Request books
            fetchBooks();

            // Listen for data
            const onData = (data: any) => {
                if (data.type === 'bible-books') {
                    setBooks(data.payload);
                    if (data.payload.length > 0 && selectedBookIndex === 0 && selectedChapterIndex === 0 && verses.length === 0) {
                        fetchChapter('kjv', 0, 0);
                    }
                }
                if (data.type === 'bible-chapter') {
                    setVerses(data.payload);
                }

                // Only sync navigation if sync is enabled
                if (data.type === 'bible-sync' && isSyncEnabled) {
                    const { version, bookIndex, chapterIndex } = data.payload;
                    setSelection(version, bookIndex, chapterIndex);
                    // Fetch without forcing reset if possible, but store handles it.
                    fetchChapter(version, bookIndex, chapterIndex);
                }
            };

            socket.on('mobile-data', onData);
            return () => { socket.off('mobile-data', onData); };
        }
    }, [socket, isSyncEnabled]); // Re-bind if sync state changes (conceptually listener uses closure state? No, effect re-runs) 
    // Actually, re-binding socket listener on every toggle is fine. 
    // Or refactor to use a ref for `isSyncEnabled` inside listener. Effect re-run is safer for this scale.

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

    const handleVerseSelect = (index: number) => {
        setShowVersesModal(false);
        if (flatListRef.current) {
            flatListRef.current.scrollToIndex({ index, animated: true, viewPosition: 0.1 });
        }
        // Don't present automatically from "Go To Verse", just scroll.
        // Or should we? "Go to" usually means "I want to see it".
        // Let's scroll only.
    }

    const handleVersePress = (index: number, text: string) => {
        // Confirmation Step
        setConfirmingVerse({ index, text });
    };

    const confirmPresentation = () => {
        if (confirmingVerse) {
            presentVerse(confirmingVerse.index, confirmingVerse.text);
            setConfirmingVerse(null);
        }
    };

    const currentBook = books[selectedBookIndex];

    // Correct Chapter Count Logic
    // Default to 150 if 'chapters' is missing (fallback)
    const chapterCount = (currentBook && currentBook.chapters) ? currentBook.chapters : 150;
    const chapters = Array.from({ length: chapterCount }, (_, i) => i + 1);

    const verseList = verses.map((_, i) => ({ index: i, label: (i + 1).toString() }));

    const versions = {
        kjv: "KJV",
        bbe: "BBE",
        asv: "ASV",
        web: "WEB",
        net: "NET",
        kjv_strongs: "KJV+",
    };

    return (
        <SafeAreaView className="flex-1 bg-[#121212]">
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header */}
            <View className="p-3 border-b border-white/10 bg-[#1a1a1a]">
                <View className="flex-row justify-between items-center mb-3">
                    <View className="flex-row items-center gap-3">
                        <TouchableOpacity onPress={() => router.back()} className="p-2 bg-white/5 rounded-full border border-white/10">
                            <CaretLeft color="white" size={20} />
                        </TouchableOpacity>
                        <Text className="text-white text-lg font-bold">Bible</Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => setIsSyncEnabled(!isSyncEnabled)}
                        className={`flex-row items-center gap-2 px-3 py-1.5 rounded-full border ${isSyncEnabled ? 'bg-blue-500/20 border-blue-500' : 'bg-white/5 border-white/10'}`}
                    >
                        {isSyncEnabled ? <LinkIcon size={14} color="#3b82f6" weight="bold" /> : <LinkBreak size={14} color="#666" />}
                        <Text className={`text-xs font-bold ${isSyncEnabled ? 'text-blue-400' : 'text-white/40'}`}>
                            {isSyncEnabled ? 'SYNCED' : 'SOLO'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Selectors Row - Compact */}
                <View className="flex-row gap-2">
                    {/* Version */}
                    <TouchableOpacity onPress={() => setShowVersions(true)} className="flex-[1.2] bg-white/5 p-2 rounded-lg border border-white/10 flex-row justify-center items-center gap-1">
                        <Text className="text-white font-bold uppercase text-[10px]" numberOfLines={1}>{versions[selectedVersion as keyof typeof versions] || selectedVersion}</Text>
                        <CaretDown color="white" size={10} />
                    </TouchableOpacity>

                    {/* Book */}
                    <TouchableOpacity onPress={() => setShowBooks(true)} className="flex-[2.5] bg-white/5 p-2 rounded-lg border border-white/10 flex-row justify-between items-center px-3">
                        <Text className="text-white font-bold text-xs truncate" numberOfLines={1}>
                            {currentBook ? currentBook.name : '...'}
                        </Text>
                        <CaretDown color="white" size={10} />
                    </TouchableOpacity>

                    {/* Chapter */}
                    <TouchableOpacity onPress={() => setShowChapters(true)} className="flex-[1] bg-white/5 p-2 rounded-lg border border-white/10 flex-row justify-center items-center gap-1">
                        <Text className="text-white font-bold text-xs">{selectedChapterIndex + 1}</Text>
                        <CaretDown color="white" size={10} />
                    </TouchableOpacity>

                    {/* Verse Button */}
                    <TouchableOpacity onPress={() => setShowVersesModal(true)} className="flex-[0.8] bg-white/5 p-2 rounded-lg border border-white/10 flex-row justify-center items-center gap-1">
                        <Text className="text-white/60 font-bold text-[10px]">Vs</Text>
                        <CaretDown color="white" size={10} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Verses List */}
            <FlatList
                ref={flatListRef}
                data={verses}
                keyExtractor={(_, i) => i.toString()}
                contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                onScrollToIndexFailed={(info) => {
                    const wait = new Promise(resolve => setTimeout(resolve, 500));
                    wait.then(() => {
                        flatListRef.current?.scrollToIndex({ index: info.index, animated: true });
                    });
                }}
                renderItem={({ item, index }) => (
                    <TouchableOpacity
                        onPress={() => handleVersePress(index, item)}
                        className="flex-row mb-3 active:bg-white/5 p-2 rounded-lg"
                    >
                        <Text className="text-white/30 font-bold w-8 pt-0.5 text-[10px]">{index + 1}</Text>
                        <Text className="text-white/90 text-[16px] flex-1 leading-6">{item}</Text>
                    </TouchableOpacity>
                )}
                ListEmptyComponent={
                    <View className="items-center justify-center mt-20 opacity-50">
                        <MagnifyingGlass color="white" size={48} />
                        <Text className="text-white mt-4">No verses loaded</Text>
                    </View>
                }
            />

            {/* Confirmation Modal */}
            <Modal visible={!!confirmingVerse} transparent animationType="fade" onRequestClose={() => setConfirmingVerse(null)}>
                <View className="flex-1 bg-black/80 items-center justify-center p-6">
                    <View className="bg-[#1e1e1e] w-full rounded-2xl border border-white/10 p-6 shadow-2xl">
                        <View className="flex-row items-center gap-3 mb-4">
                            <View className="w-10 h-10 bg-red-500/20 rounded-full items-center justify-center">
                                <Broadcast size={20} color="#ef4444" weight="fill" />
                            </View>
                            <Text className="text-white font-bold text-lg">Present to Live?</Text>
                        </View>

                        <View className="bg-white/5 p-4 rounded-lg mb-6 max-h-40">
                            <Text className="text-[#38ef7d] font-bold text-xs mb-1">
                                {currentBook?.name} {selectedChapterIndex + 1}:{confirmingVerse ? confirmingVerse.index + 1 : ''}
                            </Text>
                            <Text className="text-white/80 italic text-sm leading-5">"{confirmingVerse?.text}"</Text>
                        </View>

                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                onPress={() => setConfirmingVerse(null)}
                                className="flex-1 bg-white/5 py-4 rounded-xl items-center border border-white/5"
                            >
                                <Text className="text-white font-bold">Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={confirmPresentation}
                                className="flex-[2] bg-red-600 py-4 rounded-xl items-center shadow-lg shadow-red-900/50"
                            >
                                <Text className="text-white font-bold uppercase tracking-wider">Present Verification</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modals */}
            <SearchableListModal
                visible={showVersesModal}
                onClose={() => setShowVersesModal(false)}
                title="Go To Verse"
                data={verseList}
                keyExtractor={(item: any) => item.index.toString()}
                filterBy={(item: any, query: string) => item.label.includes(query)}
                renderItem={({ item }: any) => (
                    <TouchableOpacity
                        onPress={() => handleVerseSelect(item.index)}
                        className="flex-1 m-1 p-4 items-center justify-center rounded-lg border bg-white/5 border-white/10 aspect-square"
                    >
                        <Text className="text-white font-bold">{item.label}</Text>
                    </TouchableOpacity>
                )}
                // Use a grid for verses
                numColumns={5}
            />
            <SelectionModal
                visible={showBooks}
                onClose={() => setShowBooks(false)}
                title="Select Book"
                searchable
            >
                <FlatList
                    data={books} // Search filtering is handled inside SelectionModal if we pass props right, but current implementation wraps FlatList. 
                    // Wait, SelectionModal wraps children. The filtering needs to happen *here* or inside the Modal component.
                    // Let's refactor SelectionModal to handle filtering or pass filtered data.
                    // Actually, for cleaner code, I'll pass the *items* to SelectionModal? 
                    // No, existing pattern is composition. 
                    // I will implement a "SmartList" inside SelectionModal or just do it here.
                    // But I want a reusable Searchable Modal.
                    // I'll update SelectionModal to simply accept children and a search callback? 
                    // No, complicate.
                    // I will make SelectionModal accept a `onSearch` prop and I'll filter data here.
                    renderItem={null} // placeholder
                />
            </SelectionModal>

            {/* 
               Correction: The SelectionModal design below needs to be robust. 
               I will pass `items`, `renderItem`, `onSelect`, `keyExtractor` to a "SearchableListModal" 
               instead of generic children to handle search internally.
            */}

            <SearchableListModal
                visible={showBooks}
                onClose={() => setShowBooks(false)}
                title="Select Book"
                data={books}
                keyExtractor={(item: any) => item.abbrev}
                filterBy={(item: any, query: string) => item.name.toLowerCase().includes(query.toLowerCase())}
                renderItem={({ item, index }: any) => (
                    <TouchableOpacity
                        onPress={() => handleBookSelect(index)}
                        className={`p-4 border-b border-white/5 flex-row justify-between ${index === selectedBookIndex ? 'bg-white/10' : ''}`}
                    >
                        <Text className={`text-lg ${index === selectedBookIndex ? 'text-[#38ef7d] font-bold' : 'text-white'}`}>{item.name}</Text>
                        {index === selectedBookIndex && <Check color="#38ef7d" size={20} />}
                    </TouchableOpacity>
                )}
            />

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

            <SearchableListModal
                visible={showVersions}
                onClose={() => setShowVersions(false)}
                title="Select Version"
                data={Object.entries(versions).map(([k, v]) => ({ key: k, name: v }))}
                keyExtractor={(item: any) => item.key}
                filterBy={(item: any, query: string) => item.name.toLowerCase().includes(query.toLowerCase())}
                renderItem={({ item }: any) => (
                    <TouchableOpacity
                        onPress={() => handleVersionSelect(item.key)}
                        className={`p-4 border-b border-white/5 flex-row justify-between ${item.key === selectedVersion ? 'bg-white/10' : ''}`}
                    >
                        <Text className={`text-lg ${item.key === selectedVersion ? 'text-[#38ef7d] font-bold' : 'text-white'}`}>{item.name}</Text>
                    </TouchableOpacity>
                )}
            />

        </SafeAreaView>
    );
}

// Simple Selection Modal (for Chapters - no search needed usually, but logic kept simple)
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

// Smart Searchable Modal
const SearchableListModal = ({ visible, onClose, title, data, renderItem, keyExtractor, filterBy, numColumns = 1 }: any) => {
    const [search, setSearch] = useState("");

    // Clear search on open
    useEffect(() => {
        if (visible) setSearch("");
    }, [visible]);

    const filteredData = data.filter((item: any) => filterBy(item, search));

    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View className="flex-1 bg-black/80 justify-end">
                <View className="h-[80%] bg-[#1a1a1a] rounded-t-3xl overflow-hidden flex flex-col">
                    <View className="p-4 border-b border-white/10 flex-row justify-between items-center bg-[#252525]">
                        <Text className="text-white font-bold text-lg">{title}</Text>
                        <TouchableOpacity onPress={onClose} className="p-2 bg-white/10 rounded-full">
                            <CaretDown color="white" size={20} />
                        </TouchableOpacity>
                    </View>

                    {/* Search Bar */}
                    <View className="p-4 bg-[#1a1a1a] border-b border-white/5">
                        <View className="bg-white/5 rounded-lg flex-row items-center px-3 border border-white/10">
                            <MagnifyingGlass color="#666" size={18} />
                            <TextInput
                                value={search}
                                onChangeText={setSearch}
                                placeholder="Search..."
                                placeholderTextColor="#666"
                                className="flex-1 p-3 text-white"
                                autoCorrect={false}
                            />
                            {search.length > 0 && (
                                <TouchableOpacity onPress={() => setSearch("")}>
                                    <X color="#666" size={18} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    <FlatList
                        data={filteredData}
                        // Handle key change for numColumns to force re-render if needed (though numColumns usually static)
                        key={`list-${numColumns}`}
                        numColumns={numColumns}
                        keyExtractor={keyExtractor}
                        renderItem={renderItem}
                        className="flex-1"
                        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: numColumns > 1 ? 10 : 0 }}
                        keyboardShouldPersistTaps="handled"
                    />
                </View>
            </View>
        </Modal>
    );
};

