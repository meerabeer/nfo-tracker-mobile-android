import React, { useState, useEffect, useCallback } from 'react';
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
import { getEtaForNfo } from '../services/orsClient';
import { NFOStatus, SiteMaster } from '../types';

export const ManagerDashboardScreen: React.FC = () => {
  const { user, logout } = useAuth();
  const [nfoList, setNfoList] = useState<NFOStatus[]>([]);
  const [sites, setSites] = useState<SiteMaster[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'free' | 'busy'>(
    'all'
  );
  const [selectedNfo, setSelectedNfo] = useState<NFOStatus | null>(null);
  const [selectedSite, setSelectedSite] = useState<SiteMaster | null>(null);
  const [eta, setEta] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCalculatingEta, setIsCalculatingEta] = useState(false);
  const [showEtaModal, setShowEtaModal] = useState(false);

  const managerArea = (user as any)?.area || 'All';

  // Fetch NFOs and Sites on mount
  useEffect(() => {
    fetchNfos();
    fetchSites();

    // Set up auto-refresh every 10 seconds
    const interval = setInterval(() => {
      fetchNfos();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const fetchNfos = useCallback(async () => {
    try {
      setIsLoading(true);

      let query = supabase
        .from('nfo_status')
        .select(
          'username, logged_in, on_shift, status, activity, site_id, work_order_id, lat, lng, last_active_at, last_active_source, created_at, updated_at'
        )
        .eq('logged_in', true);

      // Filter by area if manager has specific area (optional)
      // This assumes nfo_status has an area field or we join with nfo_users
      // For now, we'll fetch all and filter on client
      const { data, error } = await query;

      if (error) {
        console.error('Error fetching NFOs:', error);
        return;
      }

      if (data) {
        // Filter by status if needed
        let filtered = data;
        if (filterStatus !== 'all') {
          filtered = data.filter((nfo) => nfo.status === filterStatus);
        }

        setNfoList(filtered);
      }
    } catch (err) {
      console.error('Error in fetchNfos:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filterStatus]);

  const fetchSites = async () => {
    try {
      const { data, error } = await supabase
        .from('sites_master')
        .select('site_id, city, area, latitude, longitude, location_type');

      if (!error && data) {
        setSites(data as SiteMaster[]);
      }
    } catch (err) {
      console.error('Error fetching sites:', err);
    }
  };

  const calculateEta = async (
    nfo: NFOStatus,
    site: SiteMaster
  ) => {
    if (!nfo.lat || !nfo.lng) {
      Alert.alert('Error', 'NFO location not available');
      return;
    }

    try {
      setIsCalculatingEta(true);
      const etaResponse = await getEtaForNfo(
        { lat: nfo.lat, lng: nfo.lng },
        { lat: site.latitude, lng: site.longitude }
      );
      setEta(etaResponse);
      setSelectedNfo(nfo);
      setSelectedSite(site);
      setShowEtaModal(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to calculate ETA');
      console.error('Error calculating ETA:', err);
    } finally {
      setIsCalculatingEta(false);
    }
  };

  // Calculate summary statistics
  const stats = {
    total: nfoList.length,
    online: nfoList.filter((nfo) => nfo.logged_in).length,
    offline: nfoList.filter((nfo) => !nfo.logged_in).length,
    free: nfoList.filter((nfo) => nfo.status === 'free').length,
    busy: nfoList.filter((nfo) => nfo.status === 'busy').length,
  };

  const formatTimeAgo = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (showEtaModal && selectedNfo && selectedSite) {
    return (
      <View style={styles.container}>
        <View style={styles.etaModalHeader}>
          <TouchableOpacity onPress={() => setShowEtaModal(false)}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.etaModalTitle}>ETA Details</Text>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView style={styles.etaModalContent}>
          <View style={styles.etaSection}>
            <Text style={styles.etaLabel}>NFO:</Text>
            <Text style={styles.etaValue}>{selectedNfo.username}</Text>
          </View>

          <View style={styles.etaSection}>
            <Text style={styles.etaLabel}>Destination Site:</Text>
            <Text style={styles.etaValue}>{selectedSite.site_id}</Text>
            <Text style={styles.etaSubtitle}>
              {selectedSite.city}, {selectedSite.area}
            </Text>
          </View>

          <View style={styles.etaSection}>
            <Text style={styles.etaLabel}>Current Location:</Text>
            <Text style={styles.etaValue}>
              {selectedNfo.lat?.toFixed(6)}, {selectedNfo.lng?.toFixed(6)}
            </Text>
          </View>

          <View style={styles.etaSection}>
            <Text style={styles.etaLabel}>Destination Coordinates:</Text>
            <Text style={styles.etaValue}>
              {selectedSite.latitude.toFixed(6)}, {selectedSite.longitude.toFixed(6)}
            </Text>
          </View>

          {eta && (
            <>
              <View style={styles.etaResult}>
                <Text style={styles.etaResultTitle}>ETA Calculation</Text>
                <View style={styles.etaResultRow}>
                  <Text style={styles.etaResultLabel}>Distance:</Text>
                  <Text style={styles.etaResultValue}>
                    {eta.distance_km.toFixed(2)} km
                  </Text>
                </View>
                <View style={styles.etaResultRow}>
                  <Text style={styles.etaResultLabel}>Duration:</Text>
                  <Text style={styles.etaResultValue}>
                    {eta.duration_min.toFixed(0)} minutes
                  </Text>
                </View>
              </View>
            </>
          )}

          {isCalculatingEta && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Calculating ETA...</Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
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

      <ScrollView style={styles.content}>
        {/* Summary Tiles */}
        <View style={styles.summaryContainer}>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{stats.total}</Text>
            <Text style={styles.summaryLabel}>Total NFOs</Text>
          </View>

          <View style={[styles.summaryTile, { backgroundColor: '#34C759' }]}>
            <Text style={styles.summaryValue}>{stats.online}</Text>
            <Text style={styles.summaryLabel}>Online</Text>
          </View>

          <View style={[styles.summaryTile, { backgroundColor: '#FF3B30' }]}>
            <Text style={styles.summaryValue}>{stats.offline}</Text>
            <Text style={styles.summaryLabel}>Offline</Text>
          </View>
        </View>

        <View style={styles.summaryContainer}>
          <View style={[styles.summaryTile, { backgroundColor: '#FF9500' }]}>
            <Text style={styles.summaryValue}>{stats.free}</Text>
            <Text style={styles.summaryLabel}>Free</Text>
          </View>

          <View style={[styles.summaryTile, { backgroundColor: '#5AC8FA' }]}>
            <Text style={styles.summaryValue}>{stats.busy}</Text>
            <Text style={styles.summaryLabel}>Busy</Text>
          </View>
        </View>

        {/* Filters */}
        <View style={styles.filterSection}>
          <Text style={styles.filterTitle}>Filter by Status</Text>
          <View style={styles.filterButtons}>
            <TouchableOpacity
              style={[
                styles.filterButton,
                filterStatus === 'all' && styles.filterButtonActive,
              ]}
              onPress={() => setFilterStatus('all')}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  filterStatus === 'all' && styles.filterButtonTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterButton,
                filterStatus === 'free' && styles.filterButtonActive,
              ]}
              onPress={() => setFilterStatus('free')}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  filterStatus === 'free' && styles.filterButtonTextActive,
                ]}
              >
                Free
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterButton,
                filterStatus === 'busy' && styles.filterButtonActive,
              ]}
              onPress={() => setFilterStatus('busy')}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  filterStatus === 'busy' && styles.filterButtonTextActive,
                ]}
              >
                Busy
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* NFO List */}
        <View style={styles.nfoListSection}>
          <Text style={styles.nfoListTitle}>Field Engineers</Text>
          {isLoading ? (
            <ActivityIndicator
              size="large"
              color="#007AFF"
              style={{ marginVertical: 20 }}
            />
          ) : nfoList.length === 0 ? (
            <Text style={styles.noDataText}>No NFOs found</Text>
          ) : (
            <FlatList
              scrollEnabled={false}
              data={nfoList}
              keyExtractor={(item) => item.username}
              renderItem={({ item }) => (
                <View style={styles.nfoCard}>
                  <View style={styles.nfoCardHeader}>
                    <Text style={styles.nfoName}>{item.username}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        item.status === 'free'
                          ? styles.statusFree
                          : styles.statusBusy,
                      ]}
                    >
                      <Text style={styles.statusBadgeText}>
                        {item.status}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.nfoCardDetails}>
                    <Text style={styles.detailText}>
                      <Text style={styles.detailLabel}>Shift:</Text>{' '}
                      {item.on_shift ? '✓ On' : '✗ Off'}
                    </Text>
                    <Text style={styles.detailText}>
                      <Text style={styles.detailLabel}>Site:</Text>{' '}
                      {item.site_id || 'N/A'}
                    </Text>
                    <Text style={styles.detailText}>
                      <Text style={styles.detailLabel}>Activity:</Text>{' '}
                      {item.activity || 'N/A'}
                    </Text>
                    <Text style={styles.detailText}>
                      <Text style={styles.detailLabel}>Last Active:</Text>{' '}
                      {formatTimeAgo(item.last_active_at)}
                    </Text>
                  </View>

                  {item.lat && item.lng && (
                    <TouchableOpacity
                      style={styles.etaButton}
                      onPress={() => {
                        // Show site selection for ETA
                        setSelectedNfo(item);
                        Alert.alert(
                          'Select Destination Site',
                          'Choose a site to calculate ETA',
                          sites.slice(0, 5).map((site) => ({
                            text: `${site.site_id} (${site.city})`,
                            onPress: () => calculateEta(item, site),
                          }))
                        );
                      }}
                      disabled={isCalculatingEta}
                    >
                      <Text style={styles.etaButtonText}>Calculate ETA</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            />
          )}
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
  content: {
    flex: 1,
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
  filterButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  filterButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#007AFF',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  nfoListSection: {
    padding: 12,
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
