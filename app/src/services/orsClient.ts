import axios from 'axios';
import { ETAResponse, LocationCoordinates } from '../types';

// Environment variables for ORS configuration
// Local dev: set in .env file
// EAS builds: set via `eas secret:create` or in eas.json env block
const orsBaseUrl = process.env.EXPO_PUBLIC_ORS_BASE_URL;
const orsApiKey = process.env.EXPO_PUBLIC_ORS_API_KEY;

if (!orsBaseUrl) {
  throw new Error(
    '[ORS] EXPO_PUBLIC_ORS_BASE_URL is missing. Configure it in .env for local dev and as EAS secrets for builds.'
  );
}

if (!orsApiKey) {
  throw new Error(
    '[ORS] EXPO_PUBLIC_ORS_API_KEY is missing. Configure it in .env for local dev and as EAS secrets for builds.'
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
    const response = await axios.post<ETAResponse>(
      `${orsBaseUrl}/route`,
      {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': orsApiKey,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error fetching ETA:', error);
    throw error;
  }
};
