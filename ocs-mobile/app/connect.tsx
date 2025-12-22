
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSocketStore } from '../store/socketStore';
import { ArrowLeft, Monitor, CheckCircle, XCircle } from 'phosphor-react-native';

export default function ConnectScreen() {
    const router = useRouter();
    const { connect, isConnected, serverIp, disconnect, connectionError } = useSocketStore();
    const [ip, setIp] = useState(serverIp || '');

    const handleConnect = () => {
        if (!ip) {
            Alert.alert('Error', 'Please enter an IP Address');
            return;
        }
        connect(ip);
    };

    return (
        <SafeAreaView className="flex-1 bg-neutral-900">
            <View className="flex-row items-center p-4 border-b border-white/10">
                <TouchableOpacity onPress={() => router.back()} className="mr-4">
                    <ArrowLeft size={24} color="white" />
                </TouchableOpacity>
                <Text className="text-white text-xl font-bold">Connect to Desktop</Text>
            </View>

            <View className="p-6 flex-1 items-center justify-center">
                <View className="w-full bg-white/5 p-6 rounded-2xl border border-white/10 items-center">
                    <View className="mb-6 bg-blue-500/20 p-6 rounded-full">
                        <Monitor size={48} color="#60A5FA" weight="duotone" />
                    </View>

                    <Text className="text-white font-bold text-lg mb-2">Enter Desktop IP</Text>
                    <Text className="text-white/50 text-center mb-6">
                        Find the IP address in the Desktop App by checking the 'Remote' tab.
                    </Text>

                    <TextInput
                        className="w-full bg-black/50 border border-white/20 text-white p-4 rounded-xl mb-4 text-center text-lg font-mono"
                        placeholder="192.168.1.X"
                        placeholderTextColor="#666"
                        value={ip}
                        onChangeText={setIp}
                        autoCapitalize="none"
                        keyboardType="default"
                    />

                    {connectionError && (
                        <View className="mb-4 bg-red-500/10 p-3 rounded-lg border border-red-500/20 w-full">
                            <Text className="text-red-400 text-xs text-center font-bold">{connectionError}</Text>
                        </View>
                    )}

                    {isConnected ? (
                        <TouchableOpacity
                            onPress={disconnect}
                            className="w-full bg-red-500/20 border border-red-500/50 p-4 rounded-xl items-center flex-row justify-center gap-2"
                        >
                            <XCircle size={20} color="#F87171" weight="bold" />
                            <Text className="text-red-400 font-bold">Disconnect</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            onPress={handleConnect}
                            className="w-full bg-blue-600 p-4 rounded-xl items-center"
                        >
                            <Text className="text-white font-bold">Connect</Text>
                        </TouchableOpacity>
                    )}

                    {isConnected && (
                        <View className="mt-4 flex-row items-center gap-2 bg-green-500/10 px-4 py-2 rounded-full border border-green-500/20">
                            <CheckCircle size={16} color="#4ADE80" weight="fill" />
                            <Text className="text-green-400 text-sm font-medium">Connected to {serverIp}</Text>
                        </View>
                    )}
                </View>
            </View>
        </SafeAreaView>
    );
}
