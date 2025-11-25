# NFO Tracker Mobile App

A production-ready Expo React Native application for tracking field engineers (NFOs) with real-time GPS location updates, shift management, and manager dashboards.

## Features

### NFO Features
- **Authentication**: Role-based login (NFO or Manager)
- **Real-time Location Tracking**: Continuous GPS heartbeats every 30 seconds (configurable)
- **Shift Management**: Toggle on/off shift status
- **Activity Status**: Track free/busy status
- **Site Selection**: Assign to specific sites from master list
- **Work Orders**: Optional work order ID assignment
- **Activity Notes**: Text input for current activity
- **Background Tracking**: Continues tracking even when app is in background
- **Location Display**: Shows current GPS coordinates
- **Debug Screen**: Monitor background task status and location updates

### Manager Features
- **Dashboard Overview**: Real-time statistics on NFO fleet
- **Summary Tiles**:
  - Total NFOs in area
  - Online/offline counts
  - Free/busy counts
- **Filtering**: Filter NFOs by status (free/busy/all)
- **NFO List**: View all active NFOs with details:
  - Name and status
  - On-shift indicator
  - Current site assignment
  - Last active time
  - Activity description
- **ETA Calculation**: Calculate distance and time to reach NFO or site using backend API

## Tech Stack

- **Framework**: Expo React Native with TypeScript
- **Navigation**: React Navigation (Stack Navigator)
- **Backend**: Supabase (PostgreSQL)
- **Location**: expo-location + expo-task-manager for background tracking
- **Routing API**: OpenRouteService-compatible backend (user's own hosted endpoint)
- **HTTP Client**: Axios

## Project Structure

```
app/
├── src/
│   ├── types/
│   │   └── index.ts              # TypeScript type definitions
│   ├── services/
│   │   ├── supabaseClient.ts     # Supabase client initialization
│   │   └── orsClient.ts          # OpenRouteService API client
│   ├── context/
│   │   └── AuthContext.tsx       # Authentication context and hooks
│   ├── screens/
│   │   ├── LoginScreen.tsx       # Role selector and login
│   │   ├── NFOHomeScreen.tsx     # NFO dashboard
│   │   └── ManagerDashboardScreen.tsx  # Manager dashboard
│   ├── components/
│   │   └── DebugScreen.tsx       # Debug information display
│   ├── hooks/
│   │   └── (custom hooks here)
│   └── navigation/
│       └── index.tsx             # Navigation stack setup
├── App.tsx                       # Main app entry point
├── app.json                      # Expo configuration
├── package.json
└── tsconfig.json
```

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm/yarn
- Expo CLI: `npm install -g eas-cli`
- A Supabase project with the required tables
- An OpenRouteService-compatible backend endpoint (hosted on Hugging Face or your own server)

### Installation

1. **Clone the repository and navigate to app folder**:
   ```bash
   cd app
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create environment configuration**:
   ```bash
   cp .env.example .env
   ```

4. **Fill in your environment variables**:
   ```bash
   # Edit .env with your actual values:
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   EXPO_PUBLIC_ORS_API_URL=https://your-backend.com/api/eta
   ```

   Alternatively, add these to `app.json` under the `expo` section:
   ```json
   {
     "expo": {
       "extra": {
         "supabaseUrl": "https://your-project.supabase.co",
         "supabaseAnonKey": "your-anon-key",
         "orsApiUrl": "https://your-backend.com/api/eta"
       }
     }
   }
   ```

### Running the App

**Local Development**:
```bash
npx expo start
```

Then press:
- `a` for Android (requires Android emulator or device)
- `i` for iOS (macOS only)
- `w` for web

**Build for Production**:
```bash
eas build --platform android
```

## Database Schema

### nfo_users
```sql
CREATE TABLE nfo_users (
  username TEXT PRIMARY KEY,
  password TEXT,
  full_name TEXT,
  home_location TEXT,
  is_active BOOLEAN
);
```

### managers
```sql
CREATE TABLE managers (
  username TEXT PRIMARY KEY,
  password TEXT,
  full_name TEXT,
  area TEXT
);
```

### sites_master
```sql
CREATE TABLE sites_master (
  site_id TEXT PRIMARY KEY,
  city TEXT,
  area TEXT,
  latitude FLOAT8,
  longitude FLOAT8,
  location_type TEXT
);
```

### nfo_status
```sql
CREATE TABLE nfo_status (
  username TEXT PRIMARY KEY,
  logged_in BOOLEAN,
  on_shift BOOLEAN,
  status TEXT, -- 'free' | 'busy'
  activity TEXT,
  site_id TEXT,
  work_order_id TEXT,
  lat FLOAT8,
  lng FLOAT8,
  last_active_at TIMESTAMPTZ,
  last_active_source TEXT, -- 'mobile-app'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (username) REFERENCES nfo_users(username)
);
```

## API Specifications

### OpenRouteService Backend Endpoint

**Request**:
```
POST /api/eta
Content-Type: application/json

{
  "origin": {
    "lat": 24.7136,
    "lng": 46.6753
  },
  "destination": {
    "lat": 24.8245,
    "lng": 46.7073
  }
}
```

**Response**:
```json
{
  "distance_km": 12.5,
  "duration_min": 18
}
```

## Configuration

### Heartbeat Interval
Located in `src/screens/NFOHomeScreen.tsx`:
```typescript
const HEARTBEAT_SECONDS = 30; // Change this to adjust frequency
```

### Background Task
The app uses `expo-task-manager` to maintain location tracking even when the app is in the background. The task runs every `HEARTBEAT_SECONDS` and sends GPS coordinates to the Supabase backend.

## Permissions

### Android
The app requires the following permissions (configured in `app.json`):
- `ACCESS_FINE_LOCATION`: Precise GPS location
- `ACCESS_COARSE_LOCATION`: Approximate location
- `ACCESS_BACKGROUND_LOCATION`: Location tracking in background

### iOS
The app requires location permissions with the message:
- "Allow NFO Tracker to access your location for field tracking"

## Debug Features

Access the debug screen in the NFO app by tapping the "Debug" button. It displays:
- Background task registration status
- Last GPS coordinates
- Last heartbeat timestamp
- Current configuration (URLs, interval)

## Production Considerations

1. **Security**: Replace plain-text password authentication with OAuth2 or magic links
2. **Rate Limiting**: Implement rate limiting on the backend for heartbeat endpoints
3. **Data Persistence**: Use AsyncStorage for local caching of critical data
4. **Error Handling**: Add retry logic for failed heartbeat submissions
5. **Analytics**: Implement analytics tracking for fleet insights
6. **Testing**: Add unit and integration tests
7. **CI/CD**: Set up automated builds with EAS

## Troubleshooting

### Background location not updating
- Ensure background location permission is granted
- Check battery optimization settings on device
- Verify the background task is properly registered (use Debug screen)

### ETA calculation fails
- Verify `EXPO_PUBLIC_ORS_API_URL` is correctly set
- Check backend endpoint is accessible and returning correct format
- Ensure NFO location is available (on shift required)

### Supabase connection errors
- Verify `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Check network connectivity
- Ensure Supabase tables exist and have correct schema

## License

This project is provided as-is for field engineer tracking.
