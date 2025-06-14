import React from 'react';
import { View, Button, StyleSheet } from 'react-native';

export default function MainScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Button title="ส่งข่าวสาร" onPress={() => navigation.navigate('Form')} />
      <View style={{ marginTop: 10 }} />
      <Button title="ดูรายการข่าวที่ส่งแล้ว" onPress={() => navigation.navigate('History')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
});
