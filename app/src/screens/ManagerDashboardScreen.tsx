import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  TextInput,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import { NFOStatus } from '../types';

interface NFOUser {
  username: string;
  name?: string;
  home_location?: string;
}

interface SiteRow {
  site_id: string;
  latitude: number | null;
  longitude: number | null;
  area?: string | null;
}

export const ManagerDashboardScreen: React.FC = () => {
  const { user, logout } = useAuth();
  const [nfoList, setNfoList] = useState<NFOStatus[]>([]);
  const [nfoUsers, setNfoUsers] = useState<NFOUser[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [selectedArea, setSelectedArea] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'free' | 'busy'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const managerArea = (user as any)?.area || 'All';

  // Fetch NFOs on mount and set up auto-refresh
  useEffect(() => {
    fetchNfos();

    // Set up auto-refresh every 10 seconds
    const interval = setInterval(() => {
      fetchNfos();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const fetchNfos = useCallback(async () => {
    try {
      setIsLoading(true);

      // Query nfo_status with only existing columns
      const { data: statusData, error: statusError } = await supabase
        .from('nfo_status')
        .select(
          'username, name, logged_in, on_shift, status, activity, site_id, home_location, lat, lng, last_ping, updated_at'
        );

      if (statusError) {
        console.error('Error fetching NFOs:', statusError);
        return;
      }

      if (statusData) {
        setNfoList(statusData as NFOStatus[]);
      }

      // Query NFOusers to get names
      const { data: usersData, error: usersError } = await supabase
        .from('NFOusers')
        .select('username, name, home_location');

      if (usersError) {
        console.error('Error fetching NFO users:', usersError);
      } else if (usersData) {
        setNfoUsers(usersData as NFOUser[]);
      }

      // Query Site_Coordinates
      const { data: sitesData, error: sitesError } = await supabase
        .from('Site_Coordinates')
        .select('site_id, latitude, longitude, area');

      if (sitesError) {
        console.error('Error fetching sites:', sitesError);
      } else if (sitesData) {
        setSites(sitesData as SiteRow[]);
      }
    } catch (err) {
      console.error('Error in fetchNfos:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get distinct areas from home_location
  const areas = useMemo(() => {
    const areaSet = new Set<string>();
    areaSet.add('All');

    nfoList.forEach((nfo) => {
      if (nfo.home_location && nfo.home_location.trim()) {
        areaSet.add(nfo.home_location);
      }
    });

    return Array.from(areaSet).sort();
  }, [nfoList]);

  // Build NFO user lookup map
  const nfoUserByUsername = useMemo(
    () =>
      new Map(
        nfoUsers.map((u) => [u.username.trim().toUpperCase(), u])
      ),
    [nfoUsers]
  );

  // Filter NFOs by selected area, status, and search query
  const filteredNfos = useMemo(() => {
    let filtered = nfoList;

    // Area filter first
    if (selectedArea !== 'All') {
      filtered = filtered.filter((nfo) => nfo.home_location === selectedArea);
    }

    // Status filter
    if (statusFilter === 'online') {
      filtered = filtered.filter((nfo) => nfo.logged_in);
    } else if (statusFilter === 'offline') {
      filtered = filtered.filter((nfo) => !nfo.logged_in);
    } else if (statusFilter === 'free') {
      filtered = filtered.filter(
        (nfo) => nfo.logged_in && nfo.on_shift && nfo.status === 'free'
      );
    } else if (statusFilter === 'busy') {
      filtered = filtered.filter(
        (nfo) => nfo.logged_in && nfo.on_shift && nfo.status === 'busy'
      );
    }
    // if 'all', no extra filtering

    // Search filter
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((nfo) => {
        const rawName = (nfo as any).name as string | undefined;
        const meta = nfoUserByUsername.get(nfo.username.trim().toUpperCase());
        const displayName =
          rawName && rawName.trim().length > 0
            ? rawName.trim()
            : meta?.name || '';
        return (
          displayName.toLowerCase().includes(q) ||
          nfo.username.toLowerCase().includes(q)
        );
      });
    }

    return filtered;
  }, [nfoList, selectedArea, statusFilter, searchQuery, nfoUserByUsername]);

  // Sort NFOs: by status (busy → free → off-shift), then by last_ping (recent first)
  const sortedNfos = useMemo(() => {
    const statusOrder = { busy: 0, free: 1, 'off-shift': 2 };
    return [...filteredNfos].sort((a, b) => {
      const statusA = statusOrder[a.status as keyof typeof statusOrder] ?? 3;
      const statusB = statusOrder[b.status as keyof typeof statusOrder] ?? 3;

      if (statusA !== statusB) {
        return statusA - statusB;
      }

      // Then sort by last_ping (most recent first)
      return new Date(b.last_ping).getTime() - new Date(a.last_ping).getTime();
    });
  }, [filteredNfos]);

  // Compute counters from full nfoList
  const stats = useMemo(() => {
    const total = nfoList.length;
    const online = nfoList.filter((nfo) => nfo.logged_in).length;
    const offline = nfoList.filter((nfo) => !nfo.logged_in).length;
    const free = nfoList.filter(
      (nfo) =>
        nfo.logged_in && nfo.on_shift && nfo.status === 'free'
    ).length;
    const busy = nfoList.filter(
      (nfo) =>
        nfo.logged_in && nfo.on_shift && nfo.status === 'busy'
    ).length;

    return { total, online, offline, free, busy };
  }, [nfoList]);

  // Format time relative to now
  const formatTimeAgo = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

      if (seconds < 60) return 'Just now';
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
      return `${Math.floor(seconds / 86400)}d ago`;
    } catch {
      return timestamp;
    }
  };

  // Get status color
  const getStatusColor = (nfo: NFOStatus): string => {
    if (!nfo.logged_in) return '#999';
    if (nfo.status === 'free') return '#FF9500';
    if (nfo.status === 'busy') return '#5AC8FA';
    return '#999';
  };

  const getStatusLabel = (nfo: NFOStatus): string => {
    if (!nfo.logged_in) return 'Offline';
    return nfo.status || 'Unknown';
  };

  const getDisplayName = (nfo: NFOStatus): string => {
    const rawName = (nfo as any).name as string | undefined;
    if (rawName && rawName.trim().length > 0) {
      return rawName.trim();
    }
    const userMeta = nfoUserByUsername.get(nfo.username.trim().toUpperCase());
    return userMeta?.name || nfo.username;
  };

  // Filter sites by selected area
  const filteredSites = useMemo(
    () =>
      sites.filter((s) => {
        if (!s.latitude || !s.longitude) return false;
        if (selectedArea === 'All') return true;
        const siteArea = (s.area || '').trim();
        return siteArea === selectedArea;
      }),
    [sites, selectedArea]
  );

  // Map region helpers
  const firstNfoWithCoords = sortedNfos.find(
    (nfo) => typeof nfo.lat === 'number' && typeof nfo.lng === 'number'
  );

  const initialLat = firstNfoWithCoords?.lat ?? 21.3891; // default Makkah
  const initialLng = firstNfoWithCoords?.lng ?? 39.8579;

  const currentRegion = {
    latitude: initialLat,
    longitude: initialLng,
    latitudeDelta: 1.0,
    longitudeDelta: 1.0,
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>
            Manager Dashboard
          </Text>
          <Text style={styles.subtitle}>Area: {managerArea}</Text>
        </View>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={logout}
        >
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View>
        {/* Summary Tiles */}
        <View style={styles.summaryContainer}>
          <TouchableOpacity
            key="total"
            style={[
              styles.summaryTile,
              statusFilter === 'all' && styles.summaryTileActive,
            ]}
            onPress={() => setStatusFilter('all')}
          >
            <Text style={styles.summaryValue}>{stats.total}</Text>
            <Text style={styles.summaryLabel}>Total NFOs</Text>
          </TouchableOpacity>

          <TouchableOpacity
            key="online"
            style={[
              styles.summaryTile,
              { backgroundColor: '#34C759' },
              statusFilter === 'online' && styles.summaryTileActive,
            ]}
            onPress={() => setStatusFilter('online')}
          >
            <Text style={styles.summaryValue}>{stats.online}</Text>
            <Text style={styles.summaryLabel}>Online</Text>
          </TouchableOpacity>

          <TouchableOpacity
            key="offline"
            style={[
              styles.summaryTile,
              { backgroundColor: '#FF3B30' },
              statusFilter === 'offline' && styles.summaryTileActive,
            ]}
            onPress={() => setStatusFilter('offline')}
          >
            <Text style={styles.summaryValue}>{stats.offline}</Text>
            <Text style={styles.summaryLabel}>Offline</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryContainer}>
          <TouchableOpacity
            key="free"
            style={[
              styles.summaryTile,
              { backgroundColor: '#FF9500' },
              statusFilter === 'free' && styles.summaryTileActive,
            ]}
            onPress={() => setStatusFilter('free')}
          >
            <Text style={styles.summaryValue}>{stats.free}</Text>
            <Text style={styles.summaryLabel}>Free</Text>
          </TouchableOpacity>

          <TouchableOpacity
            key="busy"
            style={[
              styles.summaryTile,
              { backgroundColor: '#5AC8FA' },
              statusFilter === 'busy' && styles.summaryTileActive,
            ]}
            onPress={() => setStatusFilter('busy')}
          >
            <Text style={styles.summaryValue}>{stats.busy}</Text>
            <Text style={styles.summaryLabel}>Busy</Text>
          </TouchableOpacity>
        </View>

        {/* Area Filter */}
        <View style={styles.filterSection}>
          <Text style={styles.filterTitle}>Filter by Area</Text>
          <View style={styles.areaFilterScroll}>
            {areas.map((area) => (
              <TouchableOpacity
                key={area}
                style={[
                  styles.areaButton,
                  selectedArea === area && styles.areaButtonActive,
                ]}
                onPress={() => setSelectedArea(area)}
              >
                <Text
                  style={[
                    styles.areaButtonText,
                    selectedArea === area && styles.areaButtonTextActive,
                  ]}
                >
                  {area}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* NFO List */}
        <View style={styles.nfoListSection}>
          {/* Search Box */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search NFO by name or ID..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#999"
            />
          </View>



          <Text style={styles.nfoListTitle}>Field Engineers ({sortedNfos.length})</Text>
          {isLoading ? (
            <ActivityIndicator
              size="large"
              color="#007AFF"
              style={{ marginVertical: 20 }}
            />
          ) : sortedNfos.length === 0 ? (
            <Text style={styles.noDataText}>
              {nfoList.length === 0 ? 'No NFOs found' : 'No NFOs in this area'}
            </Text>
          ) : (
            <View style={styles.nfoList}>
              {sortedNfos.map((item) => (
                <View key={item.username} style={styles.nfoCard}>
                  <View style={styles.nfoCardHeader}>
                    <View>
                      <Text style={styles.nfoName}>{getDisplayName(item)}</Text>
                      <Text style={styles.nfoId}>ID: {item.username}</Text>
                      <Text style={styles.nfoLocation}>
                        {item.home_location || 'N/A'}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: getStatusColor(item),
                        },
                      ]}
                    >
                      <Text style={styles.statusBadgeText}>
                        {getStatusLabel(item)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.nfoCardDetails}>
                    <Text style={styles.detailText}>
                      <Text style={styles.detailLabel}>Shift:</Text>{' '}
                      {item.on_shift ? '✓ On' : '✗ Off'}
                    </Text>
                    {item.site_id && (
                      <Text style={styles.detailText}>
                        <Text style={styles.detailLabel}>Site:</Text>{' '}
                        {item.site_id}
                      </Text>
                    )}
                    {item.activity && (
                      <Text style={styles.detailText}>
                        <Text style={styles.detailLabel}>Activity:</Text>{' '}
                        {item.activity}
                      </Text>
                    )}
                    <Text style={styles.detailText}>
                      <Text style={styles.detailLabel}>Last Active:</Text>{' '}
                      {formatTimeAgo(item.last_ping)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    paddingBottom: 32,
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
  summaryContainer: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
  },
  summaryTile: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#fff',
    marginTop: 4,
  },
  summaryTileActive: {
    borderWidth: 3,
    borderColor: '#000',
    opacity: 0.9,
  },
  filterSection: {
    backgroundColor: '#fff',
    margin: 12,
    padding: 16,
    borderRadius: 8,
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  areaFilterScroll: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  areaButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  areaButtonActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  areaButtonText: {
    fontSize: 13,
    color: '#666',
  },
  areaButtonTextActive: {
    color: '#fff',
  },
  nfoListSection: {
    padding: 12,
  },
  nfoList: {
    marginTop: 8,
  },
  searchContainer: {
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  mapContainer: {
    marginTop: 12,
    marginBottom: 16,
    height: 260,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  map: {
    flex: 1,
  },
  nfoListTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  noDataText: {
    textAlign: 'center',
    color: '#999',
    paddingVertical: 20,
  },
  nfoCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 10,
    padding: 12,
  },
  nfoCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  nfoName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  nfoId: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  nfoLocation: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusFree: {
    backgroundColor: '#FF9500',
  },
  statusBusy: {
    backgroundColor: '#5AC8FA',
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  nfoCardDetails: {
    gap: 6,
    marginBottom: 10,
  },
  detailText: {
    fontSize: 13,
    color: '#666',
  },
  detailLabel: {
    fontWeight: '600',
    color: '#333',
  },
  etaButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  etaButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  etaModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    fontSize: 16,
    color: '#007AFF',
  },
  etaModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  etaModalContent: {
    padding: 16,
  },
  etaSection: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 6,
    marginBottom: 12,
  },
  etaLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  etaValue: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  etaSubtitle: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  etaResult: {
    backgroundColor: '#f0f0f0',
    padding: 16,
    borderRadius: 8,
    marginTop: 12,
  },
  etaResultTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  etaResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  etaResultLabel: {
    fontSize: 14,
    color: '#666',
  },
  etaResultValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#34C759',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    color: '#999',
  },
});

export default ManagerDashboardScreen;
