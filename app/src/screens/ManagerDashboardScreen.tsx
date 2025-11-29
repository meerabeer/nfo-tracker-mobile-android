import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Manager dashboard is not used in this build.
 * All users are routed to the NFO flow regardless of role.
 */
const ManagerDashboardScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Manager dashboard not used in this build.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  text: {
    fontSize: 16,
    color: '#666',
  },
});

export default ManagerDashboardScreen;
