import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Clock, Book, Monitor, SquaresFour,
  MusicNotes, Microphone, Camera, Broadcast, Gear,
  House, CaretRight, Link
} from 'phosphor-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Dashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  // Fixed 2 columns unless very small screen
  const numColumns = width < 380 ? 1 : 2;

  const cards = [
    {
      id: 'connect',
      label: 'Connect',
      icon: Link,
      gradient: ['#FF416C', '#FF4B2B'], // Red/Pink Gradient
      iconColor: '#ffffff',
      description: 'Host Setup'
    },
    {
      id: 'timer',
      label: 'Timer',
      icon: Clock,
      gradient: ['#11998e', '#38ef7d'], // Green Gradient
      iconColor: '#ffffff',
      description: 'Sync & Events'
    },
    {
      id: 'bible',
      label: 'Bible',
      icon: Book,
      gradient: ['#2980B9', '#6DD5FA'], // Blue Gradient
      iconColor: '#ffffff',
      description: 'Scripture'
    },
    {
      id: 'presentation',
      label: 'Media',
      icon: Monitor,
      gradient: ['#8E2DE2', '#4A00E0'], // Purple Gradient
      iconColor: '#ffffff',
      description: 'Slides & Content'
    },
    {
      id: 'intercom',
      label: 'Intercom',
      icon: Microphone,
      gradient: ['#f12711', '#f5af19'], // Orange/Red Gradient
      iconColor: '#ffffff',
      description: 'Team Chat'
    },
    {
      id: 'camera',
      label: 'Camera',
      icon: Camera,
      gradient: ['#000000', '#434343'], // Dark Gradient
      iconColor: '#ffffff',
      description: 'Remote View'
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Gear,
      gradient: ['#4B79A1', '#283E51'], // Steel Blue Gradient
      iconColor: '#ffffff',
      description: 'Config'
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-[#121212]">
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Header */}
        <View className="flex-row items-center justify-between mb-8 mt-2">
          <View>
            <Text className="text-3xl font-black text-white tracking-tight">OCS<Text className="text-green-400">.</Text></Text>
            <Text className="text-white/40 text-xs uppercase tracking-[0.2em] font-medium">Controller Mobile</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/settings' as any)}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 items-center justify-center active:bg-white/10"
          >
            <Gear color="white" size={20} />
          </TouchableOpacity>
        </View>

        {/* Grid */}
        <View className="flex-row flex-wrap justify-between">
          {cards.map((card) => {
            const Icon = card.icon;
            const cardWidth = (width - 40 - 15) / numColumns; // 40 padding, 15 gap

            return (
              <TouchableOpacity
                key={card.id}
                onPress={() => router.push(`/${card.id}` as any)}
                style={{ width: numColumns > 1 ? cardWidth : '100%', marginBottom: 15 }}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={card.gradient as [string, string, ...string[]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  className="rounded-[24px] p-5 h-44 justify-between relative overflow-hidden shadow-lg"
                  style={{ shadowColor: card.gradient[0], shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 10 }}
                >

                  {/* Background Accents */}
                  <View className="absolute -right-6 -top-6 rounded-full w-24 h-24 bg-white/20 blur-xl" />
                  <View className="absolute -left-6 -bottom-6 rounded-full w-32 h-32 bg-black/10 blur-xl" />

                  <View className="flex-row justify-between items-start z-10">
                    <View className="w-10 h-10 rounded-2xl bg-white/20 items-center justify-center backdrop-blur-sm border border-white/10">
                      <Icon color={card.iconColor} size={20} weight="fill" />
                    </View>
                    <View className="bg-black/20 rounded-full p-1 opacity-0">
                      <CaretRight color="white" size={12} weight="bold" />
                    </View>
                  </View>

                  <View className="z-10">
                    <Text className="text-xl font-bold text-white leading-tight mb-1 drop-shadow-md">
                      {card.label}
                    </Text>
                    <Text className="text-white/80 text-xs font-semibold tracking-wide bg-black/10 self-start px-2 py-1 rounded-lg overflow-hidden">
                      {card.description}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Footer info or stats could go here */}
        <View className="mt-8 items-center">
          <Text className="text-white/20 text-xs">v1.0.0 • Connected</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
