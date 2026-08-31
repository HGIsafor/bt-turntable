import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const PRESETS = {
  Warm: { bass: 65, mid: 45, treble: 40, ambience: 35, gain: 60 },
  Flat: { bass: 50, mid: 50, treble: 50, ambience: 20, gain: 55 },
  Bright: { bass: 40, mid: 55, treble: 70, ambience: 25, gain: 50 },
};

type ProfileName = keyof typeof PRESETS;

type Profile = {
  bass: number;
  mid: number;
  treble: number;
  ambience: number;
  gain: number;
};

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.meterRow}>
      <Text style={styles.meterLabel}>{label}</Text>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${value}%` }]} />
      </View>
      <Text style={styles.meterValue}>{value}</Text>
    </View>
  );
}

export default function App() {
  const [selectedProfile, setSelectedProfile] = useState<ProfileName>('Flat');
  const [profile, setProfile] = useState<Profile>(PRESETS.Flat);

  const toneSummary = useMemo(() => {
    if (profile.bass > profile.treble + 10) return 'Bass-forward';
    if (profile.treble > profile.bass + 10) return 'Treble-forward';
    return 'Balanced tone';
  }, [profile.bass, profile.treble]);

  const applyPreset = (name: ProfileName) => {
    setSelectedProfile(name);
    setProfile(PRESETS[name]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Turntable Sound Profile</Text>
        <Text style={styles.subtitle}>UI skeleton only — Bluetooth/control logic intentionally omitted.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Profiles</Text>
          <View style={styles.presetRow}>
            {(Object.keys(PRESETS) as ProfileName[]).map((name) => {
              const active = selectedProfile === name;
              return (
                <Pressable
                  key={name}
                  onPress={() => applyPreset(name)}
                  style={[styles.presetButton, active && styles.presetButtonActive]}
                >
                  <Text style={[styles.presetButtonText, active && styles.presetButtonTextActive]}>
                    {name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tone</Text>
          <Meter label="Bass" value={profile.bass} />
          <Meter label="Mid" value={profile.mid} />
          <Meter label="Treble" value={profile.treble} />
          <Meter label="Ambience" value={profile.ambience} />
          <Meter label="Output" value={profile.gain} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Session Snapshot</Text>
          <Text style={styles.snapshotText}>Current profile: {selectedProfile}</Text>
          <Text style={styles.snapshotText}>Tone shape: {toneSummary}</Text>
          <Text style={styles.snapshotText}>Ready for future connectivity hooks.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#10131a',
  },
  container: {
    paddingHorizontal: 18,
    paddingVertical: 22,
    gap: 14,
  },
  title: {
    color: '#f4f7ff',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: '#a6b1c3',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#1a202b',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  cardTitle: {
    color: '#f4f7ff',
    fontSize: 16,
    fontWeight: '600',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetButton: {
    flex: 1,
    borderColor: '#384052',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  presetButtonActive: {
    backgroundColor: '#f4f7ff',
  },
  presetButtonText: {
    color: '#c8d1e3',
    fontWeight: '600',
  },
  presetButtonTextActive: {
    color: '#10131a',
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  meterLabel: {
    color: '#d3dbeb',
    width: 70,
    fontSize: 13,
  },
  meterTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#2f3748',
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#7db6ff',
  },
  meterValue: {
    width: 26,
    textAlign: 'right',
    color: '#d3dbeb',
    fontVariant: ['tabular-nums'],
  },
  snapshotText: {
    color: '#d3dbeb',
    fontSize: 14,
  },
});
