import React from 'react';
import { Text } from 'react-native-paper';

export const PriceText = ({ value, currency = '$' }: { value: number; currency?: string }) => {
  const sign = value > 0 ? '+' : '';
  const color = value > 0 ? '#22c55e' : value < 0 ? '#ef4444' : '#94a3b8';
  return (
    <Text variant="bodyMedium" style={{ color, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
      {sign}
      {currency}
      {value.toFixed(2)}
    </Text>
  );
};
