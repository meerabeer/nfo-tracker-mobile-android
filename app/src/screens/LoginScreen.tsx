import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { loginWithSupabase, UserRole as AuthApiUserRole } from '../services/authApi';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('NFO');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Missing data', 'Please enter username and password.');
      return;
    }

    setLoading(true);
    try {
      // Validate with loginWithSupabase first
      const apiRole: AuthApiUserRole = role === 'NFO' ? 'nfo' : 'manager';
      const user = await loginWithSupabase(apiRole, username, password);
      console.log('Login successful:', user);
      
      // Then update auth context to trigger navigation
      await login(username, password, role);
    } catch (err) {
      Alert.alert(
        'Login error',
        err instanceof Error ? err.message : 'Unable to login.'
      );
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>NFO Tracker</Text>
      <Text style={styles.subtitle}>Field Engineer Tracking System</Text>

      <View style={styles.roleSelector}>
        <TouchableOpacity
          style={[
            styles.roleButton,
            role === 'NFO' && styles.roleButtonActive,
          ]}
          onPress={() => setRole('NFO')}
        >
          <Text
            style={[
              styles.roleButtonText,
              role === 'NFO' && styles.roleButtonTextActive,
            ]}
          >
            NFO
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.roleButton,
            role === 'Manager' && styles.roleButtonActive,
          ]}
          onPress={() => setRole('Manager')}
        >
          <Text
            style={[
              styles.roleButtonText,
              role === 'Manager' && styles.roleButtonTextActive,
            ]}
          >
            Manager
          </Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        editable={!loading}
        placeholderTextColor="#999"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
        placeholderTextColor="#999"
      />

      <TouchableOpacity
        style={[styles.loginButton, loading && styles.loginButtonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <Text style={styles.loginButtonText}>Logging in…</Text>
        ) : (
          <Text style={styles.loginButtonText}>Login</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.infoText}>
        Note: Login with valid credentials from the Supabase database
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
  },
  roleSelector: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 10,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  roleButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#007AFF',
  },
  roleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  roleButtonTextActive: {
    color: '#fff',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  loginButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    marginBottom: 10,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 20,
  },
});
