import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import NFOHomeScreen from '../screens/NFOHomeScreen';

export type RootStackParamList = {
  Login: undefined;
  NFOHome: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export const Navigation: React.FC = () => {
  const { user } = useAuth();

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: '#fff' },
        }}
      >
        {!user ? (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{
              animationEnabled: false,
            }}
          />
        ) : (
          <Stack.Screen
            name="NFOHome"
            component={NFOHomeScreen}
            options={{
              animationEnabled: false,
            }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default Navigation;
