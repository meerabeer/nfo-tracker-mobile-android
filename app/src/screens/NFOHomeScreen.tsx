import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { NFOStatusType, LocationCoordinates } from '../types';
import DebugScreen from '../components/DebugScreen';

const HEARTBEAT_SECONDS = 30; // Configurable heartbeat interval
const BACKGROUND_TASK_NAME = 'NFO_TRACKING_TASK';

const ACTIVITY_OPTIONS = [
  'Outage',
  'Alarms',
  'H05',
  'Survey',
  'PMR',
  'MDT',
  'JV',
] as const;

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
  const [activity, setActivity] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState(''); // Final chosen site ID
  const [siteQuery, setSiteQuery] = useState(''); // User's typed input
  const [workOrderId, setWorkOrderId] = useState('');
  const [currentLocation, setCurrentLocation] = useState<LocationCoordinates | null>(
    null
  );
  const [lastHeartbeat, setLastHeartbeat] = useState<string>('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [backgroundTaskRegistered, setBackgroundTaskRegistered] =
    useState(false);
  const [siteOptions, setSiteOptions] = useState<string[]>([]); // All valid site IDs from Site_Coordinates
  const [showSiteSuggestions, setShowSiteSuggestions] = useState(false); // Show/hide dropdown
  const [showActivityMenu, setShowActivityMenu] = useState(false); // Show/hide activity dropdown
  const [showDebug, setShowDebug] = useState(false);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(
    null
  );

  const username = (user as any)?.username || '';

  // Filter site options based on current query
  const filteredSiteOptions = useMemo(() => {
    if (!siteQuery.trim()) return siteOptions;
    return siteOptions.filter((option) =>
      option.toLowerCase().includes(siteQuery.toLowerCase())
    );
  }, [siteOptions, siteQuery]);

  // Create normalized lookup of valid site IDs (case-insensitive)
  const normalizedSiteIdSet = useMemo(
    () => new Set(siteOptions.map((id) => id.trim().toLowerCase())),
    [siteOptions]
  );

  // Derive status automatically based on onShift, activity, and selectedSiteId
  const derivedStatus = useMemo<NFOStatusType | 'off'>(() => {
    if (!onShift) return 'off';
    const hasActivity = activity.trim().length > 0;
    const hasSiteId = selectedSiteId.trim().length > 0;
    return hasActivity || hasSiteId ? 'busy' : 'free';
  }, [onShift, activity, selectedSiteId]);

  // Format last updated time
  const formatLastUpdated = (date: Date | null): string => {
    if (!date) return '';
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

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

    // Fetch all available site IDs from Site_Coordinates table with pagination
    const loadSites = async () => {
      const PAGE_SIZE = 1000;

      try {
        let allIds: string[] = [];
        let from = 0;
        let to = PAGE_SIZE - 1;

        // Paginate until we get less than PAGE_SIZE rows
        while (true) {
          const { data, error } = await supabase
            .from('Site_Coordinates')
            .select('site_id')
            .order('site_id')
            .range(from, to);

          console.log('Site_Coordinates batch fetch:', {
            from,
            to,
            rows: data?.length ?? 0,
            error,
          });

          if (error) {
            console.error('Error loading sites batch', error);
            break;
          }

          const batchIds = (data ?? [])
            .map((row: any) => String(row.site_id).trim())
            .filter((id) => id.length > 0);

          allIds = allIds.concat(batchIds);

          // If this batch returned less than PAGE_SIZE rows, we reached the end
          if (!data || data.length < PAGE_SIZE) {
            break;
          }

          from += PAGE_SIZE;
          to += PAGE_SIZE;
        }

        // Remove any accidental duplicates and set state
        const uniqueIds = Array.from(new Set(allIds));

        console.log('Total site IDs loaded:', {
          count: uniqueIds.length,
          sample: uniqueIds.slice(0, 20),
        });

        setSiteOptions(uniqueIds);
      } catch (e) {
        console.error('Unexpected error loading sites', e);
      }
    };

    loadSites();    return () => {
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
      }
    };
  }, []);

  // Handle shift toggle
  const handleShiftToggle = async (newValue: boolean) => {
    setOnShift(newValue);

    if (newValue) {
      // Start background tracking when going on shift
      await startBackgroundTracking();
    } else {
      // Stop background tracking when going off shift
      await stopBackgroundTracking();
    }

    // Send status update immediately when shift changes
    if (currentLocation) {
      await sendStatusHeartbeat(currentLocation.lat, currentLocation.lng);
    }
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
              await sendLocationHeartbeat(
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

      Alert.alert('Success', 'Background tracking stopped');
    } catch (err) {
      console.error('Error stopping background tracking:', err);
    }
  };

  const sendStatusHeartbeat = async (lat: number, lng: number) => {
    try {
      setIsLoading(true);

      // VALIDATION: Enhanced site ID validation logic
      const typed = siteQuery.trim();
      const chosen = (selectedSiteId || '').trim();
      let finalSiteId: string | null = null;

      // 1) If user typed something but did not select from dropdown:
      if (typed.length > 0 && !chosen) {
        if (!normalizedSiteIdSet.has(typed.toLowerCase())) {
          Alert.alert(
            'Invalid Site ID',
            `"${typed}" is not a valid site. Please tap a site from the dropdown list.`
          );
          setIsLoading(false);
          return;
        }

        // Find canonical ID from siteOptions (correct case/format)
        finalSiteId =
          siteOptions.find(
            (id) => id.trim().toLowerCase() === typed.toLowerCase()
          ) ?? typed;

        setSelectedSiteId(finalSiteId); // keep state in sync
      }

      // 2) If there is a selectedSiteId (from dropdown):
      if (chosen.length > 0) {
        if (!normalizedSiteIdSet.has(chosen.toLowerCase())) {
          Alert.alert(
            'Invalid Site ID',
            `"${chosen}" is not a valid site. Please select a valid site from the list.`
          );
          setIsLoading(false);
          return;
        }

        finalSiteId =
          siteOptions.find(
            (id) => id.trim().toLowerCase() === chosen.toLowerCase()
          ) ?? chosen;
      }

      // Derive status for heartbeat:
      // - If off shift -> 'off-shift'
      // - Else if activity or finalSiteId has non-empty value -> 'busy'
      // - Else -> 'free'
      let statusForDb: string;
      if (!onShift) {
        statusForDb = 'off-shift';
      } else {
        const hasActivity = activity.trim().length > 0;
        const hasSiteId = finalSiteId ? finalSiteId.length > 0 : false;
        statusForDb = hasActivity || hasSiteId ? 'busy' : 'free';
      }

      // 3) If status is busy, require a valid site
      if (statusForDb === 'busy' && !finalSiteId) {
        Alert.alert(
          'Site required',
          'Please select a site before marking yourself busy.'
        );
        setIsLoading(false);
        return;
      }

      // Extract home_location from user object if available
      const userObj = user as any;
      const homeLocation = userObj?.home_location || null;

      const now = new Date().toISOString();

      const heartbeatPayload = {
        username: username,
        logged_in: true,
        on_shift: onShift,
        status: statusForDb,
        activity: activity || null,
        site_id: finalSiteId, // Use finalSiteId (canonical from siteOptions)
        work_order_id: workOrderId || null,
        lat: lat,
        lng: lng,
        home_location: homeLocation,
        updated_at: now,
        last_ping: now,
        last_active_at: now,
        last_active_source: 'mobile-app',
      };

      console.log('Heartbeat payload (status)', heartbeatPayload);

      const { error } = await supabase.from('nfo_status').upsert(
        heartbeatPayload,
        { onConflict: 'username' }
      );

      console.log('Supabase heartbeat result (status)', { data: null, error });

      if (!error) {
        setLastHeartbeat(new Date().toLocaleTimeString());
      } else {
        console.error('Supabase error (status):', error);
      }
    } catch (err) {
      console.error('Error sending status heartbeat:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const sendLocationHeartbeat = async (lat: number, lng: number) => {
    try {
      const now = new Date().toISOString();

      const locationPayload = {
        username: username,
        lat: lat,
        lng: lng,
        last_ping: now,
        last_active_at: now,
        last_active_source: 'mobile-app-gps',
      };

      console.log('Location heartbeat payload', locationPayload);

      const { error } = await supabase.from('nfo_status').upsert(
        locationPayload,
        { onConflict: 'username' }
      );

      console.log('Supabase heartbeat result (location)', { data: null, error });

      if (error) {
        console.error('Supabase error (location):', error);
      }
    } catch (err) {
      console.error('Error sending location heartbeat:', err);
    }
  };

  const handleUpdateActivity = async () => {
    // Update lastUpdatedAt timestamp
    setLastUpdatedAt(new Date());
    // Send status update immediately
    if (currentLocation) {
      await sendStatusHeartbeat(currentLocation.lat, currentLocation.lng);
    }
  };

  const handleCloseActivity = async () => {
    // Clear activity, selectedSiteId, and workOrderId
    setActivity('');
    setSelectedSiteId('');
    setSiteQuery('');
    setWorkOrderId('');
    setShowActivityMenu(false); // Close activity dropdown
    // Update lastUpdatedAt to current time
    setLastUpdatedAt(new Date());
    // Send status update immediately
    if (currentLocation) {
      await sendStatusHeartbeat(currentLocation.lat, currentLocation.lng);
    }
  };

  const handleLogout = async () => {
    try {
      // Stop background tracking first
      if (onShift) {
        await stopBackgroundTracking();
      }

      // Clear all activity state for final logout heartbeat
      setOnShift(false);
      setActivity('');
      setSelectedSiteId('');
      setSiteQuery('');
      setWorkOrderId('');
      setShowActivityMenu(false); // Close activity dropdown

      // Send final clean logout heartbeat with all fields cleared
      const now = new Date().toISOString();
      
      const logoutPayload = {
        username: username,
        logged_in: false,
        on_shift: false,
        status: 'off-shift',
        activity: null,
        site_id: null,
        work_order_id: null,
        lat: currentLocation?.lat || null,
        lng: currentLocation?.lng || null,
        updated_at: now,
        last_ping: now,
        last_active_at: now,
        last_active_source: 'mobile-app',
      };

      console.log('Logout heartbeat payload', logoutPayload);

      try {
        const { error } = await supabase.from('nfo_status').upsert(
          logoutPayload,
          { onConflict: 'username' }
        );

        console.log('Logout heartbeat result', { data: null, error });

        if (error) {
          console.error('Error sending logout heartbeat:', error);
        }
      } catch (err) {
        console.error('Error sending logout heartbeat:', err);
      }
    } finally {
      // Call logout from auth context, which will update auth state
      // and trigger navigation back to Login screen via root navigator
      logout();
    }
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
    <ScrollView
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
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
        </View>
      </View>

      {/* Logout Button - Prominent and Visible */}
      <View style={styles.logoutSection}>
        <TouchableOpacity
          style={styles.screenLogoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.screenLogoutButtonText}>Logout</Text>
        </TouchableOpacity>
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

      {/* Derived Status Display */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Status</Text>
        <View style={styles.statusPill}>
          <Text
            style={[
              styles.statusPillText,
              derivedStatus === 'free' && styles.statusFreePill,
              derivedStatus === 'busy' && styles.statusBusyPill,
              derivedStatus === 'off' && styles.statusOffPill,
            ]}
          >
            {derivedStatus === 'off'
              ? 'Off Shift'
              : derivedStatus === 'free'
              ? 'Free'
              : 'Busy'}
          </Text>
        </View>
      </View>

      {/* Site Selection (Search + Dropdown) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Site</Text>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>
            Site ID: {selectedSiteId || 'Not assigned'}
          </Text>
          <TextInput
            style={styles.siteInput}
            placeholder="Search and select site ID..."
            value={siteQuery}
            onChangeText={(text: string) => {
              setSiteQuery(text);
              setShowSiteSuggestions(true);
            }}
            onFocus={() => setShowSiteSuggestions(true)}
            placeholderTextColor="#999"
          />
          
          {/* Dropdown List */}
          {showSiteSuggestions && filteredSiteOptions.length > 0 && (
            <View style={styles.dropdownContainer}>
              <FlatList
                data={filteredSiteOptions}
                keyExtractor={(item, idx) => `${item}-${idx}`}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.dropdownOption}
                    onPress={() => {
                      setSelectedSiteId(item);
                      setSiteQuery(item);
                      setShowSiteSuggestions(false);
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {/* No results message */}
          {showSiteSuggestions &&
            siteQuery.trim().length > 0 &&
            filteredSiteOptions.length === 0 && (
              <View style={styles.dropdownContainer}>
                <Text style={styles.noResultsText}>No matching sites found</Text>
              </View>
            )}

          {/* Clear button and apply selection info */}
          {selectedSiteId && (
            <TouchableOpacity
              onPress={() => {
                setSelectedSiteId('');
                setSiteQuery('');
                setShowSiteSuggestions(false);
              }}
              style={styles.clearButton}
            >
              <Text style={styles.clearButtonText}>Clear Selection</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Activity Dropdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Activity</Text>
        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={styles.activityDropdown}
            onPress={() => setShowActivityMenu(!showActivityMenu)}
          >
            <Text
              style={[
                styles.activityDropdownText,
                !activity && styles.activityPlaceholder,
              ]}
            >
              {activity || 'Select activity...'}
            </Text>
          </TouchableOpacity>

          {/* Activity Dropdown Menu - Scrollable */}
          {showActivityMenu && (
            <ScrollView
              style={styles.activityMenuContainer}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {ACTIVITY_OPTIONS.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.activityMenuItem,
                    activity === item && styles.activityMenuItemActive,
                  ]}
                  onPress={() => {
                    setActivity(item);
                    setShowActivityMenu(false);
                  }}
                >
                  <Text
                    style={[
                      styles.activityMenuItemText,
                      activity === item && styles.activityMenuItemTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>

      {/* Update Activity & Close Activity Buttons */}
      <View style={styles.section}>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.updateButton}
            onPress={handleUpdateActivity}
          >
            <Text style={styles.updateButtonText}>Update Activity</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.closeActivityButton}
            onPress={handleCloseActivity}
          >
            <Text style={styles.closeActivityButtonText}>Close Activity</Text>
          </TouchableOpacity>
        </View>
        {lastUpdatedAt && (
          <Text style={styles.lastUpdatedText}>
            Last updated at {formatLastUpdated(lastUpdatedAt)}
          </Text>
        )}
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
          onPress={() => sendStatusHeartbeat(currentLocation.lat, currentLocation.lng)}
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
        onFocus: () => {
          setIsFocused(true);
          props.onFocus?.();
        },
        onBlur: () => {
          setIsFocused(false);
          props.onBlur?.();
        },
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
  statusPill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  statusPillText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  statusFreePill: {
    color: '#FF9500',
  },
  statusBusyPill: {
    color: '#5AC8FA',
  },
  statusOffPill: {
    color: '#999',
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
  siteInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fff',
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
  updateButton: {
    flex: 1,
    backgroundColor: '#34C759',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  updateButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  lastUpdatedText: {
    fontSize: 12,
    color: '#34C759',
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '500',
  },
  logoutSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  screenLogoutButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CC2C26',
  },
  screenLogoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  closeActivityButton: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeActivityButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownContainer: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    maxHeight: 200,
  },
  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  dropdownOptionText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  noResultsText: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  clearButton: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  activityDropdown: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  activityDropdownText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  activityPlaceholder: {
    color: '#999',
  },
  activityMenuContainer: {
    maxHeight: 250,
    marginTop: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  activityMenuItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  activityMenuItemActive: {
    backgroundColor: '#007AFF',
  },
  activityMenuItemText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  activityMenuItemTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default NFOHomeScreen;
