import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { NFOStatusType, LocationCoordinates } from '../types';
import DebugScreen from '../components/DebugScreen';

const HEARTBEAT_SECONDS = 30; // Configurable heartbeat interval
const BACKGROUND_TASK_NAME = 'NFO_TRACKING_TASK';

interface LocationUpdate {
  lat: number;
  lng: number;
}

// Register background task
TaskManager.defineTask(BACKGROUND_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background task error:', error);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    if (locations && locations.length > 0) {
      const lastLocation = locations[locations.length - 1];
      // Note: We can't directly access React state here, so we'll store in AsyncStorage
      // or use a different pattern. For now, log it.
      console.log(
        'Background location update:',
        lastLocation.coords.latitude,
        lastLocation.coords.longitude
      );
    }
  }
});

export const NFOHomeScreen: React.FC = () => {
  const { user, logout } = useAuth();
  const [onShift, setOnShift] = useState(false);
  const [status, setStatus] = useState<NFOStatusType>('free');
  const [activity, setActivity] = useState('');
  const [siteId, setSiteId] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');
  const [currentLocation, setCurrentLocation] = useState<LocationCoordinates | null>(
    null
  );
  const [lastHeartbeat, setLastHeartbeat] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [backgroundTaskRegistered, setBackgroundTaskRegistered] =
    useState(false);
  const [sites, setSites] = useState<any[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(
    null
  );

  const username = (user as any)?.username || '';

  // Request location permissions and start tracking
  useEffect(() => {
    const initializeLocation = async () => {
      try {
        const { status: foregroundStatus } =
          await Location.requestForegroundPermissionsAsync();
        if (foregroundStatus !== 'granted') {
          Alert.alert('Permission Denied', 'Location permission is required');
          return;
        }

        const { status: backgroundStatus } =
          await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          console.warn('Background location permission not granted');
        }

        // Get initial location
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setCurrentLocation({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        });

        // Subscribe to foreground location updates
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 10,
          },
          (location) => {
            setCurrentLocation({
              lat: location.coords.latitude,
              lng: location.coords.longitude,
            });
          }
        );
        locationSubscriptionRef.current = subscription;
      } catch (err) {
        console.error('Location initialization error:', err);
      }
    };

    initializeLocation();

    // Fetch available sites
    const fetchSites = async () => {
      try {
        const { data, error } = await supabase
          .from('sites_master')
          .select('site_id, city, area');

        if (!error && data) {
          setSites(data);
        }
      } catch (err) {
        console.error('Error fetching sites:', err);
      }
    };

    fetchSites();

    return () => {
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
      }
    };
  }, []);

  // Handle shift toggle
  const handleShiftToggle = async (newValue: boolean) => {
    setOnShift(newValue);

    if (newValue) {
      // Start background tracking
      await startBackgroundTracking();
    } else {
      // Stop background tracking
      await stopBackgroundTracking();
    }

    // Update status in database
    await updateNFOStatus(newValue);
  };

  const startBackgroundTracking = async () => {
    try {
      const isTaskDefined = TaskManager.isTaskDefined(BACKGROUND_TASK_NAME);

      if (!isTaskDefined) {
        TaskManager.defineTask(BACKGROUND_TASK_NAME, async ({ data, error }) => {
          if (error) {
            console.error('Background task error:', error);
            return;
          }

          if (data) {
            const { locations } = data as {
              locations: Location.LocationObject[];
            };
            if (locations && locations.length > 0) {
              const location = locations[locations.length - 1];
              await sendHeartbeat(
                location.coords.latitude,
                location.coords.longitude
              );
            }
          }
        });
      }

      // Start location tracking in background
      await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: HEARTBEAT_SECONDS * 1000,
        distanceInterval: 0,
        foregroundService: {
          notificationTitle: 'NFO Tracking Active',
          notificationBody: 'Sending location updates...',
        },
      });

      setBackgroundTaskRegistered(true);

      // Also set up foreground interval for immediate updates
      heartbeatIntervalRef.current = setInterval(
        async () => {
          if (currentLocation) {
            await sendHeartbeat(currentLocation.lat, currentLocation.lng);
          }
        },
        HEARTBEAT_SECONDS * 1000
      );

      Alert.alert('Success', 'Background tracking started');
    } catch (err) {
      console.error('Error starting background tracking:', err);
      Alert.alert('Error', 'Failed to start background tracking');
    }
  };

  const stopBackgroundTracking = async () => {
    try {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
      setBackgroundTaskRegistered(false);

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }

      Alert.alert('Success', 'Background tracking stopped');
    } catch (err) {
      console.error('Error stopping background tracking:', err);
    }
  };

  const sendHeartbeat = async (lat: number, lng: number) => {
    try {
      setIsLoading(true);

      const { error } = await supabase.from('nfo_status').upsert(
        {
          username: username,
          logged_in: true,
          on_shift: onShift,
          status: status,
          activity: activity,
          site_id: siteId || null,
          work_order_id: workOrderId || null,
          lat: lat,
          lng: lng,
          last_active_at: new Date().toISOString(),
          last_active_source: 'mobile-app',
        },
        { onConflict: 'username' }
      );

      if (!error) {
        setLastHeartbeat(new Date().toLocaleTimeString());
      } else {
        console.error('Supabase error:', error);
      }
    } catch (err) {
      console.error('Error sending heartbeat:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const updateNFOStatus = async (onShiftValue: boolean) => {
    try {
      const { error } = await supabase.from('nfo_status').upsert(
        {
          username: username,
          logged_in: true,
          on_shift: onShiftValue,
          status: status,
          activity: activity,
          site_id: siteId || null,
          work_order_id: workOrderId || null,
          lat: currentLocation?.lat || null,
          lng: currentLocation?.lng || null,
          last_active_at: new Date().toISOString(),
          last_active_source: 'mobile-app',
        },
        { onConflict: 'username' }
      );

      if (error) {
        console.error('Error updating status:', error);
      }
    } catch (err) {
      console.error('Error updating NFO status:', err);
    }
  };

  const handleLogout = async () => {
    // Stop tracking before logout
    if (onShift) {
      await stopBackgroundTracking();
    }

    // Update logged_in to false
    try {
      await supabase.from('nfo_status').upsert(
        {
          username: username,
          logged_in: false,
          on_shift: false,
          last_active_at: new Date().toISOString(),
        },
        { onConflict: 'username' }
      );
    } catch (err) {
      console.error('Error during logout:', err);
    }

    logout();
  };

  if (showDebug) {
    return (
      <DebugScreen
        backgroundTaskRegistered={backgroundTaskRegistered}
        lastGpsLocation={currentLocation}
        lastHeartbeat={lastHeartbeat}
        onClose={() => setShowDebug(false)}
      />
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Welcome, {(user as any)?.full_name}</Text>
          <Text style={styles.subtitle}>NFO Dashboard</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.debugButton}
            onPress={() => setShowDebug(true)}
          >
            <Text style={styles.debugButtonText}>Debug</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Shift Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Shift Status</Text>
        <TouchableOpacity
          style={[
            styles.shiftToggle,
            onShift && styles.shiftToggleActive,
          ]}
          onPress={() => handleShiftToggle(!onShift)}
        >
          <Text style={styles.shiftToggleText}>
            {onShift ? 'On Shift' : 'Off Shift'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Activity Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Activity Status</Text>
        <View style={styles.statusButtons}>
          <TouchableOpacity
            style={[
              styles.statusButton,
              status === 'free' && styles.statusButtonActive,
            ]}
            onPress={() => setStatus('free')}
          >
            <Text
              style={[
                styles.statusButtonText,
                status === 'free' && styles.statusButtonTextActive,
              ]}
            >
              Free
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statusButton,
              status === 'busy' && styles.statusButtonActive,
            ]}
            onPress={() => setStatus('busy')}
          >
            <Text
              style={[
                styles.statusButtonText,
                status === 'busy' && styles.statusButtonTextActive,
              ]}
            >
              Busy
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Site Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Site</Text>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Site ID: {siteId || 'Not selected'}</Text>
          <ScrollView style={styles.siteList} horizontal>
            {sites.slice(0, 5).map((site) => (
              <TouchableOpacity
                key={site.site_id}
                style={[
                  styles.siteButton,
                  siteId === site.site_id && styles.siteButtonActive,
                ]}
                onPress={() => setSiteId(site.site_id)}
              >
                <Text
                  style={[
                    styles.siteButtonText,
                    siteId === site.site_id && styles.siteButtonTextActive,
                  ]}
                >
                  {site.site_id}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Activity Text */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Activity</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Enter activity details"
            value={activity}
            onChangeText={setActivity}
            multiline
            numberOfLines={3}
            placeholderTextColor="#999"
          />
        </View>
      </View>

      {/* Work Order ID */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Work Order ID (Optional)</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Enter work order ID"
            value={workOrderId}
            onChangeText={setWorkOrderId}
            placeholderTextColor="#999"
          />
        </View>
      </View>

      {/* Current Location */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Location</Text>
        {currentLocation ? (
          <View style={styles.locationBox}>
            <Text style={styles.locationText}>
              Lat: {currentLocation.lat.toFixed(6)}
            </Text>
            <Text style={styles.locationText}>
              Lng: {currentLocation.lng.toFixed(6)}
            </Text>
          </View>
        ) : (
          <Text style={styles.loadingText}>Getting location...</Text>
        )}
      </View>

      {/* Last Heartbeat */}
      {lastHeartbeat && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Last Heartbeat</Text>
          <View style={styles.heartbeatBox}>
            <Text style={styles.heartbeatText}>{lastHeartbeat}</Text>
          </View>
        </View>
      )}

      {/* Manual Send Heartbeat Button */}
      {onShift && currentLocation && (
        <TouchableOpacity
          style={styles.sendButton}
          onPress={() => sendHeartbeat(currentLocation.lat, currentLocation.lng)}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>Send Heartbeat Now</Text>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
};

const TextInput = (props: any) => {
  const [isFocused, setIsFocused] = React.useState(false);
  return (
    <View>
      {React.createElement(require('react-native').TextInput, {
        ...props,
        onFocus: () => setIsFocused(true),
        onBlur: () => setIsFocused(false),
        style: [props.style, isFocused && { borderColor: '#007AFF' }],
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  headerButtons: {
    gap: 8,
  },
  debugButton: {
    backgroundColor: '#667',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  debugButtonText: {
    color: '#fff',
    fontSize: 12,
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 12,
  },
  section: {
    backgroundColor: '#fff',
    margin: 12,
    padding: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  shiftToggle: {
    backgroundColor: '#ff9500',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  shiftToggleActive: {
    backgroundColor: '#34C759',
  },
  shiftToggleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  statusButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#007AFF',
  },
  statusButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  statusButtonTextActive: {
    color: '#fff',
  },
  inputContainer: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  siteList: {
    flexDirection: 'row',
  },
  siteButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 8,
    backgroundColor: '#fff',
  },
  siteButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#007AFF',
  },
  siteButtonText: {
    fontSize: 12,
    color: '#666',
  },
  siteButtonTextActive: {
    color: '#fff',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  locationBox: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#eee',
  },
  locationText: {
    fontSize: 14,
    color: '#333',
    fontFamily: 'monospace',
  },
  loadingText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  heartbeatBox: {
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 6,
  },
  heartbeatText: {
    fontSize: 14,
    color: '#34C759',
    fontWeight: '500',
  },
  sendButton: {
    backgroundColor: '#007AFF',
    marginHorizontal: 12,
    marginBottom: 20,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default NFOHomeScreen;
