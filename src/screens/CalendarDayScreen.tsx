import React, { useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAppContext } from '../context/AppContext';
import { PriceText } from '../components/PriceText';
import { ZoomableImage } from '../components/ZoomableImage';

type Props = NativeStackScreenProps<RootStackParamList, 'CalendarDay'>;

export const CalendarDayScreen = ({ route }: Props) => {
  const { state, dispatch } = useAppContext();
  const { date } = route.params;
  const [imageViewerUri, setImageViewerUri] = useState<string | null>(null);

  const inputTheme = {
    colors: {
      background: '#0F1419',
      outline: '#1E293B',
      primary: '#7C3AED',
      onSurface: '#E2E8F0',
      onSurfaceVariant: '#64748B'
    },
    roundness: 12
  };

  const trades = useMemo(() => {
    return state.trades.filter((t) => {
      const dt = new Date(t.timestamp);
      if (!Number.isFinite(dt.getTime())) return false;
      const key = `${dt.getFullYear()}-${`${dt.getMonth() + 1}`.padStart(2, '0')}-${`${dt.getDate()}`.padStart(2, '0')}`;
      return key === date;
    });
  }, [state.trades, date]);

  const onPickTradeImage = async (tradeId: string) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to attach images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    dispatch({ type: 'UPDATE_TRADE_DETAILS', payload: { id: tradeId, imageUri: asset.uri } });
  };

  const onRemoveTradeImage = (tradeId: string) => {
    dispatch({ type: 'UPDATE_TRADE_DETAILS', payload: { id: tradeId, imageUri: null } });
  };

  const openImageViewer = (uri: string) => {
    setImageViewerUri(uri);
  };

  const closeImageViewer = () => {
    setImageViewerUri(null);
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.panel}>
          <Card.Title title={`Trades on ${date}`} />
          <Card.Content>
            {trades.length === 0 ? (
              <Text style={styles.empty}>No trades for this day.</Text>
            ) : (
              <>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  <Text style={[styles.tableCell, styles.tableHeaderText, styles.colTradeSymbol]}>SYMBOL</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderText, styles.colTradePnl]}>PNL</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderText, styles.colTradeCategory]}>CATEGORY</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderText, styles.colTradeAction]}>DELETE</Text>
                </View>
                {trades.map((trade, index) => (
                  <View key={trade.id} style={styles.tradeCard}>
                    <View style={[styles.tableRow, index % 2 === 1 ? styles.tableAlt : null]}>
                      <Text style={[styles.tableCell, styles.colTradeSymbol]} numberOfLines={1}>{trade.symbol}</Text>
                      <View style={styles.colTradePnl}>
                        <PriceText value={trade.pnl} />
                      </View>
                      <View style={styles.colTradeCategory}>
                        <Text style={styles.categoryText}>{trade.category || 'Uncategorized'}</Text>
                      </View>
                      <View style={styles.colTradeAction}>
                        <Button
                          compact
                          mode="text"
                          textColor="#ef4444"
                          onPress={() => dispatch({ type: 'DELETE_TRADE', payload: trade.id })}
                        >
                          Delete
                        </Button>
                      </View>
                    </View>

                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Image</Text>
                      <View style={styles.imageWrap}>
                        {trade.imageUri ? (
                          <Pressable onPress={() => openImageViewer(trade.imageUri)}>
                          <Image source={{ uri: trade.imageUri }} style={styles.tradeImage} resizeMode="contain" />
                          </Pressable>
                        ) : (
                          <View style={styles.imagePlaceholder}>
                            <Text style={styles.placeholderText}>No image attached</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.detailButtonRow}>
                        <Button mode="outlined" onPress={() => onPickTradeImage(trade.id)}>Add / Change</Button>
                        {trade.imageUri ? (
                          <Button mode="text" textColor="#ef4444" onPress={() => onRemoveTradeImage(trade.id)}>Remove</Button>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.detailSection}>
                      <TextInput
                        label="Description"
                        value={trade.notes ?? ''}
                        onChangeText={(value) =>
                          dispatch({
                            type: 'UPDATE_TRADE_DETAILS',
                            payload: { id: trade.id, notes: value.trim() ? value : undefined }
                          })
                        }
                        mode="outlined"
                        multiline
                        numberOfLines={3}
                        style={styles.detailInput}
                        theme={inputTheme}
                      />
                    </View>
                  </View>
                ))}
              </>
            )}
          </Card.Content>
        </Card>
      </ScrollView>

      <Modal transparent visible={!!imageViewerUri} animationType="fade" onRequestClose={closeImageViewer}>
        <Pressable style={styles.imageViewerBackdrop} onPress={closeImageViewer}>
          <Pressable style={styles.imageViewerCard} onPress={() => null}>
            {imageViewerUri ? (
              <View style={styles.imageViewerScroll}>
                <ZoomableImage source={{ uri: imageViewerUri }} />
              </View>
            ) : null}
            <Button mode="text" onPress={closeImageViewer}>Close</Button>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  panel: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  empty: { color: '#94A3B8', marginTop: 8 },
  tableHeader: { borderBottomWidth: 1, borderBottomColor: '#1A2332' },
  tableHeaderText: { color: '#7f8fa9', fontSize: 12, letterSpacing: 0.8, fontWeight: '600' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A2332' },
  tableAlt: { backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8 },
  tableCell: { fontSize: 13, color: '#dbe5f6' },
  colTradeSymbol: { flex: 1.2, paddingRight: 10, fontWeight: '600', color: '#F8FAFC' },
  colTradePnl: { flex: 0.95, alignItems: 'flex-end', paddingRight: 10 },
  colTradeCategory: { flex: 1.2, alignItems: 'flex-start', paddingRight: 6 },
  colTradeAction: { flex: 0.9, alignItems: 'flex-end' },
  categoryText: { color: '#cbd5f5', fontSize: 12 },
  tradeCard: { marginBottom: 16 },
  detailLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  detailSection: { gap: 8, marginTop: 10 },
  detailButtonRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  imageWrap: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#1E293B' },
  tradeImage: { width: '100%', height: 180, backgroundColor: '#0F1419' },
  imagePlaceholder: { width: '100%', height: 180, backgroundColor: '#0F1419', alignItems: 'center', justifyContent: 'center' },
  imageViewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(6, 8, 15, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18
  },
  imageViewerCard: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: '#0F1419',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 12
  },
  imageViewerScroll: { width: '100%', height: 420 },
  imageViewerScrollContent: { alignItems: 'center', justifyContent: 'center' },
  imageViewerImage: { width: '100%', height: 420, backgroundColor: '#0F1419' },
  placeholderText: { color: '#64748B', fontSize: 12 },
  detailInput: { backgroundColor: '#0F1419' }
});
