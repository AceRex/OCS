
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSocketStore } from '../store/socketStore';
import { ArrowLeft, Monitor, CheckCircle, XCircle } from 'phosphor-react-native';

export default function ConnectScreen() {
    const router = useRouter();
    const { connect, isConnected, isPaired, serverIp, disconnect, connectionError } = useSocketStore();
    const [ip, setIp] = useState(serverIp || '');
    const [pairingCode, setPairingCode] = useState('');

    const handleConnect = () => {
        if (!ip) {
            Alert.alert('Error', 'Please enter an IP Address');
            return;
        }
        if (!pairingCode.trim()) {
            Alert.alert('Error', 'Enter the 6-digit pairing code from the desktop Remote panel');
            return;
        }
        connect(ip, pairingCode.trim());
    };

    const ready = isConnected && isPaired;

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

                    <Text className="text-white font-bold text-lg mb-2">Pair with Desktop</Text>
                    <Text className="text-white/50 text-center mb-6">
                        Enter the desktop LAN IP and the 6-digit pairing code from the Remote panel.
                    </Text>

                    <TextInput
                        className="w-full bg-black/50 border border-white/20 text-white p-4 rounded-xl mb-3 text-center text-lg font-mono"
                        placeholder="192.168.1.X"
                        placeholderTextColor="#666"
                        value={ip}
                        onChangeText={setIp}
                        autoCapitalize="none"
                        keyboardType="default"
                    />

                    <TextInput
                        className="w-full bg-black/50 border border-white/20 text-white p-4 rounded-xl mb-4 text-center text-2xl font-mono tracking-widest"
                        placeholder="000000"
                        placeholderTextColor="#666"
                        value={pairingCode}
                        onChangeText={setPairingCode}
                        keyboardType="number-pad"
                        maxLength={6}
                    />

                    {connectionError && (
                        <View className="mb-4 bg-red-500/10 p-3 rounded-lg border border-red-500/20 w-full">
                            <Text className="text-red-400 text-xs text-center font-bold">{connectionError}</Text>
                        </View>
                    )}

                    {ready ? (
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
                            <Text className="text-white font-bold">
                                {isConnected && !isPaired ? 'Pairing…' : 'Connect & Pair'}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {ready && (
                        <View className="mt-4 flex-row items-center gap-2 bg-green-500/10 px-4 py-2 rounded-full border border-green-500/20">
                            <CheckCircle size={16} color="#4ADE80" weight="fill" />
                            <Text className="text-green-400 text-sm font-medium">Paired with {serverIp}</Text>
                        </View>
                    )}
                </View>
            </View>
        </SafeAreaView>
    );
}
