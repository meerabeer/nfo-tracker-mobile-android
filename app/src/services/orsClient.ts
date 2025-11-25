import axios from 'axios';
import { ETAResponse, LocationCoordinates } from '../types';

// TODO: Set this environment variable in app.json or .env file:
// EXPO_PUBLIC_ORS_API_URL - Your backend endpoint that proxies OpenRouteService
// Example: https://your-backend.com/api/eta

const ORS_API_URL = process.env.EXPO_PUBLIC_ORS_API_URL;

if (!ORS_API_URL) {
  console.warn(
    'Missing ORS API configuration. Please set EXPO_PUBLIC_ORS_API_URL env variable.'
  );
}

/**
 * Calculate ETA from origin to destination using OpenRouteService-compatible backend
 * @param origin - Origin coordinates {lat, lng}
 * @param destination - Destination coordinates {lat, lng}
 * @returns ETA response with distance_km and duration_min
 */
export const getEtaForNfo = async (
  origin: LocationCoordinates,
  destination: LocationCoordinates
): Promise<ETAResponse> => {
  try {
    if (!ORS_API_URL) {
      throw new Error('ORS API URL not configured');
    }

    const response = await axios.post<ETAResponse>(ORS_API_URL, {
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching ETA:', error);
    throw error;
  }
};
