
import { create } from 'zustand';
import { useSocketStore } from './socketStore';

export interface BibleBook {
    name: string;
    abbrev: string;
    chapters: number; // or calculate? Desktop just sends list maybe
}

interface BibleState {
    books: BibleBook[]; // Need to fetch these from desktop
    selectedVersion: string;
    selectedBookIndex: number;
    selectedChapterIndex: number;
    verses: string[];

    // Actions
    setBooks: (books: BibleBook[]) => void;
    setSelection: (version: string, bookIndex: number, chapterIndex: number) => void;
    setVerses: (verses: string[]) => void;

    // Socket Sync
    fetchBooks: () => void;
    fetchChapter: (version: string, bookIndex: number, chapterIndex: number) => void;
    presentVerse: (verseIndex: number, text: string) => void;
}

export const useBibleStore = create<BibleState>((set, get) => ({
    books: [],
    selectedVersion: 'kjv',
    selectedBookIndex: 0,
    selectedChapterIndex: 0,
    verses: [],

    setBooks: (books) => set({ books }),
    setSelection: (version, bookIndex, chapterIndex) => set({ selectedVersion: version, selectedBookIndex: bookIndex, selectedChapterIndex: chapterIndex }),
    setVerses: (verses) => set({ verses }),

    fetchBooks: () => {
        const socket = useSocketStore.getState().socket;
        if (socket) {
            socket.emit('mobile-action', { type: 'bible-get-books' });
            // We need to listen for response? 
            // Socket.io standard is request/response usually via ack or separate event.
            // Let's assume server broadcasts 'bible-books-data' or similar. 
            // OR use Ack callback if we can. 
            // Since we use 'mobile-action' which is generic, we probably need a focused listener.
            // Let's implement listener in a component or here if we can bind it.
            // Ideally the socket store handles incoming generic data or we bind listeners.
        }
    },

    fetchChapter: (version, bookIndex, chapterIndex) => {
        set({ selectedVersion: version, selectedBookIndex: bookIndex, selectedChapterIndex: chapterIndex, verses: [] });
        const socket = useSocketStore.getState().socket;
        if (socket) {
            socket.emit('mobile-action', {
                type: 'bible-get-chapter',
                payload: { version, bookId: bookIndex, chapter: chapterIndex + 1 }
            });
        }
    },

    presentVerse: (verseIndex, text) => {
        // OR use useSocketStore if socket is not in this store? 
        // socket is in socketStore, not here? 
        // Wait, socketStore is imported. 
        // But get() gets THIS store's state. 
        // Correct approach:
        const socket = useSocketStore.getState().socket;

        if (socket) {
            const state = get();
            socket.emit('mobile-action', {
                type: 'bible-present',
                payload: {
                    indices: [verseIndex],
                    version: state.selectedVersion,
                    bookIndex: state.selectedBookIndex,
                    chapterIndex: state.selectedChapterIndex
                }
            });
        }
    }
}));
