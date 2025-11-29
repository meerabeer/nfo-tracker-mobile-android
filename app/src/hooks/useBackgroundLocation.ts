import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_TASK_NAME = 'NFO_TRACKING_TASK';

// Store callback ref at module level so the task can access it
let onLocationUpdateRef: ((lat: number, lng: number) => Promise<void>) | null = null;
let setLastUpdateTimeRef: ((date: Date) => void) | null = null;

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

  // Keep refs updated so the background task can access latest values
  useEffect(() => {
    onLocationUpdateRef = onLocationUpdate || null;
    setLastUpdateTimeRef = setLastUpdateTime;
  }, [onLocationUpdate]);

  useEffect(() => {
    // If not enabled, do nothing
    if (!enabled) return;

    const setupBackgroundTask = async () => {
      try {
        // Check if task is already defined
        const isDefined = TaskManager.isTaskDefined(BACKGROUND_TASK_NAME);

        // Define the task exactly once if not already defined
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
                // Use the last location in the array
                if (locations && locations.length > 0) {
                  const location = locations[locations.length - 1];
                  const lat = location.coords.latitude;
                  const lng = location.coords.longitude;

                  // Call onLocationUpdate if provided
                  if (onLocationUpdateRef) {
                    try {
                      await onLocationUpdateRef(lat, lng);
                      // Update lastUpdateTime after successful callback
                      if (setLastUpdateTimeRef) {
                        setLastUpdateTimeRef(new Date());
                      }
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
      } catch (err) {
        console.error('Error setting up background location:', err);
      }
    };

    setupBackgroundTask();

    // Cleanup: stop tracking when enabled becomes false or component unmounts
    return () => {
      (async () => {
        try {
          const hasStarted = await Location.hasStartedLocationUpdatesAsync(
            BACKGROUND_TASK_NAME
          );
          if (hasStarted) {
            await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
          }
        } catch (err) {
          // Task not found / not started is safe to ignore
          console.warn('Background tracking was not running, nothing to stop.');
        }
        setIsRegistered(false);
      })();
    };
  }, [enabled, heartbeatIntervalSeconds]);

  const stopTracking = async () => {
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(
        BACKGROUND_TASK_NAME
      );

      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
      }

      setIsRegistered(false);
    } catch (err) {
      // Task not found / not started is safe to ignore
      console.warn('Background tracking was not running, nothing to stop.');
    }
  };

  return {
    isRegistered,
    lastUpdateTime,
    stopTracking,
  };
};
