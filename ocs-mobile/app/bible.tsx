import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';

export default function BibleScreen() {
    return (
        <SafeAreaView className="flex-1 bg-gray-900 p-4">
            <Stack.Screen options={{ title: 'AI Bible', headerStyle: { backgroundColor: '#1a202c' }, headerTintColor: '#fff' }} />
            <Text className="text-white text-2xl font-bold">Bible Feature</Text>
            <Text className="text-gray-400 mt-2">This feature is under construction.</Text>
        </SafeAreaView>
    );
}
