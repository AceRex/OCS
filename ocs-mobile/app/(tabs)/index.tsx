import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Clock, Book, Monitor, SquaresFour,
  MusicNotes, Microphone, Camera, Broadcast, Gear,
  House
} from 'phosphor-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Dashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  // Responsive grid columns
  const numColumns = width > 768 ? 3 : width > 600 ? 2 : 1;

  const cards = [
    {
      id: 'timer',
      label: 'Timer Sync',
      icon: Clock,
      colors: ['#FF9966', '#FF5E62'],
      description: 'Admin-controlled distributed timer system'
    },
    {
      id: 'bible',
      label: 'AI Bible',
      icon: Book,
      colors: ['#56CCF2', '#2F80ED'],
      description: 'Intelligent scripture lookup & display'
    },
    {
      id: 'presentation',
      label: 'Presentation',
      icon: Monitor,
      colors: ['#EC008C', '#FC6767'],
      description: 'Dynamic slides with media backgrounds'
    },
    {
      id: 'songs',
      label: 'Song Lyrics',
      icon: MusicNotes,
      colors: ['#8E2DE2', '#4A00E0'],
      description: 'Lyric projection with auto-load'
    },
    {
      id: 'intercom',
      label: 'Inapp Communication',
      icon: Microphone,
      colors: ['#00b09b', '#96c93d'],
      description: 'Push-to-talk team communication'
    },
    {
      id: 'camera',
      label: 'Cameras',
      icon: Camera,
      colors: ['#43cea2', '#185a9d'],
      description: 'USB & Mobile camera integration'
    },
    {
      id: 'stream',
      label: 'Live Stream',
      icon: Broadcast,
      colors: ['#D31027', '#EA384D'],
      description: 'RTMP Streaming & Scene management'
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Gear,
      colors: ['#636FA4', '#E8CBC0'],
      description: 'System personalization and calibration'
    },
    {
      id: 'apps',
      label: 'More Apps',
      icon: SquaresFour,
      colors: ['#34e89e', '#0f3443'],
      description: 'Additional tools and settings'
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-gray-900">
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View className="flex-row items-center gap-2 mb-6">
          <House color="#A0AEC0" size={24} weight="fill" />
          <Text className="text-xl font-bold text-gray-400 uppercase tracking-widest">
            Dashboard
          </Text>
        </View>

        <View className="flex-row flex-wrap justify-between" style={{ gap: 16 }}>
          {cards.map((card) => {
            const Icon = card.icon;
            // Calculate width based on columns and gap
            // gap is 16. For 2 columns: (width - 32 - 16) / 2
            const cardWidth = (width - 32 - (16 * (numColumns - 1))) / numColumns;

            return (
              <TouchableOpacity
                key={card.id}
                onPress={() => router.push(`/${card.id}`)}
                style={{ width: '100%', maxWidth: numColumns > 1 ? cardWidth : '100%' }}
                className="mb-4"
              >
                <LinearGradient
                  colors={card.colors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  className="rounded-3xl p-6 h-48 justify-between relative overflow-hidden shadow-lg"
                >
                  <View className="absolute -right-5 -bottom-5 opacity-20 transform rotate-12">
                    <Icon color="white" size={150} weight="fill" />
                  </View>

                  <View className="z-10">
                    <View className="w-12 h-12 rounded-full bg-white/20 items-center justify-center mb-4">
                      <Icon color="white" size={24} weight="bold" />
                    </View>
                    <Text className="text-2xl font-bold text-white shadow-sm">
                      {card.label}
                    </Text>
                  </View>

                  <View className="z-10">
                    <Text className="text-white/80 text-sm font-medium">
                      {card.description}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
