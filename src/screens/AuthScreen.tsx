import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';

export const AuthScreen = () => {
  const { hasPasscode, setupPasscode, signIn } = useAuth();

  const [passcode, setPasscode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);

    if (passcode.trim().length < 4) {
      setError('Passcode must be at least 4 characters.');
      return;
    }

    setLoading(true);
    try {
      if (!hasPasscode) {
        if (passcode !== confirm) {
          setError('Passcode confirmation does not match.');
          return;
        }
        await setupPasscode(passcode);
        return;
      }

      const ok = await signIn(passcode);
      if (!ok) {
        setError('Invalid passcode.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.wrap}>
        <Card style={styles.card}>
          <Card.Title
            title={hasPasscode ? 'Sign In' : 'Set Passcode'}
            subtitle={hasPasscode ? 'Unlock your trading journal' : 'Create a passcode to protect app access'}
          />
          <Card.Content>
            <TextInput
              mode="outlined"
              label="Passcode"
              value={passcode}
              onChangeText={setPasscode}
              secureTextEntry
              autoCapitalize="none"
            />

            {!hasPasscode ? (
              <TextInput
                mode="outlined"
                label="Confirm Passcode"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoCapitalize="none"
                style={styles.input}
              />
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button mode="contained" onPress={onSubmit} loading={loading} style={styles.button} buttonColor="#8b7cf6">
              {hasPasscode ? 'Sign In' : 'Save Passcode'}
            </Button>
          </Card.Content>
        </Card>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center' },
  card: { backgroundColor: '#111827', borderColor: '#283349', borderWidth: 1 },
  input: { marginTop: 10 },
  button: { marginTop: 14 },
  error: { marginTop: 8, color: '#ef4444' }
});
