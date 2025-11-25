import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { LocationCoordinates, DebugInfo } from '../types';

interface DebugScreenProps {
  backgroundTaskRegistered: boolean;
  lastGpsLocation: LocationCoordinates | null;
  lastHeartbeat: string;
  onClose: () => void;
}

const DebugScreen: React.FC<DebugScreenProps> = ({
  backgroundTaskRegistered,
  lastGpsLocation,
  lastHeartbeat,
  onClose,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Debug Information</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Background Task Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Background Task Status</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Registered:</Text>
            <View
              style={[
                styles.statusIndicator,
                backgroundTaskRegistered && styles.statusActive,
              ]}
            >
              <Text style={styles.statusText}>
                {backgroundTaskRegistered ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
        </View>

        {/* GPS Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Last GPS Location</Text>
          {lastGpsLocation ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Latitude:</Text>
              <Text style={styles.infoValue}>
                {lastGpsLocation.lat.toFixed(8)}
              </Text>
              <Text style={styles.infoLabel}>Longitude:</Text>
              <Text style={styles.infoValue}>
                {lastGpsLocation.lng.toFixed(8)}
              </Text>
            </View>
          ) : (
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>No location data available</Text>
            </View>
          )}
        </View>

        {/* Last Heartbeat */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Last Heartbeat</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Time:</Text>
            <Text style={styles.infoValue}>
              {lastHeartbeat || 'No heartbeat sent yet'}
            </Text>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Information</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>App Name:</Text>
            <Text style={styles.infoValue}>NFO Tracker</Text>
            <Text style={styles.infoLabel}>Version:</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
        </View>

        {/* Configuration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuration</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Heartbeat Interval:</Text>
            <Text style={styles.infoValue}>30 seconds</Text>
            <Text style={styles.infoLabel}>Supabase URL:</Text>
            <Text style={styles.infoValue}>
              {process.env.EXPO_PUBLIC_SUPABASE_URL || 'Not configured'}
            </Text>
            <Text style={styles.infoLabel}>ORS API URL:</Text>
            <Text style={styles.infoValue}>
              {process.env.EXPO_PUBLIC_ORS_API_URL || 'Not configured'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#667',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    fontSize: 24,
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  infoBox: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginTop: 8,
  },
  infoValue: {
    fontSize: 13,
    color: '#333',
    fontFamily: 'monospace',
    marginTop: 4,
    marginBottom: 4,
  },
  statusIndicator: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  statusActive: {
    backgroundColor: '#34C759',
  },
  statusText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
});

export default DebugScreen;
