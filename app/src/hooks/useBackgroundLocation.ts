import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_TASK_NAME = 'NFO_TRACKING_TASK';

interface UseBackgroundLocationOptions {
  onLocationUpdate?: (lat: number, lng: number) => Promise<void>;
  heartbeatIntervalSeconds?: number;
  enabled?: boolean;
}

export const useBackgroundLocation = ({
  onLocationUpdate,
  heartbeatIntervalSeconds = 30,
  enabled = false,
}: UseBackgroundLocationOptions) => {
  const [isRegistered, setIsRegistered] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);

  useEffect(() => {
    const setupBackgroundTask = async () => {
      if (!enabled) return;

      try {
        // Check if task is already defined
        const isDefined = TaskManager.isTaskDefined(BACKGROUND_TASK_NAME);

        if (!isDefined) {
          TaskManager.defineTask(
            BACKGROUND_TASK_NAME,
            async ({ data, error }) => {
              if (error) {
                console.error('Background location task error:', error);
                return;
              }

              if (data) {
                const { locations } = data as {
                  locations: Location.LocationObject[];
                };
                if (locations && locations.length > 0) {
                  const location = locations[locations.length - 1];
                  if (onLocationUpdate) {
                    try {
                      await onLocationUpdate(
                        location.coords.latitude,
                        location.coords.longitude
                      );
                    } catch (err) {
                      console.error('Error calling onLocationUpdate:', err);
                    }
                  }
                }
              }
            }
          );
        }

        // Start location updates
        await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, {
          accuracy: Location.Accuracy.High,
          timeInterval: heartbeatIntervalSeconds * 1000,
          distanceInterval: 0,
          foregroundService: {
            notificationTitle: 'NFO Tracking Active',
            notificationBody: 'Sending location updates...',
          },
        });

        setIsRegistered(true);
        setLastUpdateTime(new Date());
      } catch (err) {
        console.error('Error setting up background location:', err);
      }
    };

    setupBackgroundTask();

    return () => {
      if (enabled) {
        Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME).catch(
          (err) => console.error('Error stopping location updates:', err)
        );
      }
    };
  }, [enabled, onLocationUpdate, heartbeatIntervalSeconds]);

  const stopTracking = async () => {
    try {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
      setIsRegistered(false);
    } catch (err) {
      console.error('Error stopping tracking:', err);
    }
  };

  return {
    isRegistered,
    lastUpdateTime,
    stopTracking,
  };
};
