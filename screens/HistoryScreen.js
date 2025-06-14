import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { collection, getDocs, orderBy, query, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function HistoryScreen() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    try {
      const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const items = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setData(items);
    } catch (error) {
      console.error('❌ เกิดข้อผิดพลาด:', error);
    }
  };

  const handleDelete = async (id) => {
  if (Platform.OS === 'web') {
    const confirm = window.confirm('คุณต้องการลบรายการนี้หรือไม่? (ไม่ได้เป็นการยกเลิกการส่ง)');
    if (confirm) {
      try {
        await deleteDoc(doc(db, 'news', id));
        setData(prevData => prevData.filter(item => item.id !== id));
        console.log(`✅ ลบข้อมูล id: ${id}`);
      } catch (error) {
        console.error('❌ ลบไม่สำเร็จ:', error);
      }
    }
  } else {
    Alert.alert(
      'ยืนยันการลบ',
      'คุณต้องการลบรายการนี้หรือไม่?',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'news', id));
              setData(prevData => prevData.filter(item => item.id !== id));
              console.log(`✅ ลบข้อมูล id: ${id}`);
            } catch (error) {
              console.error('❌ ลบไม่สำเร็จ:', error);
            }
          },
        },
      ],
      { cancelable: true }
    );
  }
};

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.title}>หัวข้อ: {item.topic}</Text>
      <Text>รายละเอียด: {item.detail}</Text>
      <Text>การดำเนินการ: {item.action}</Text>
      <Text>หมู่บ้าน: {item.village}</Text>
      <Text>ความถี่: {item.frequency}</Text>
      <Text>จำนวนรอบ: {item.repeatCount} ครั้ง</Text>
      <Text>เวลาที่แจ้งเตือน: {item.notifyTime?.toDate().toLocaleString()}</Text>
      <Text>เวลาที่สร้าง: {item.createdAt?.toDate().toLocaleString()}</Text>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDelete(item.id)}
      >
        <Text style={styles.deleteButtonText}>ลบ</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <FlatList
      data={data}
      renderItem={renderItem}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.container}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  card: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    backgroundColor: '#f9f9f9',
  },
  title: { fontWeight: 'bold', marginBottom: 5 },
  deleteButton: {
    marginTop: 10,
    backgroundColor: '#ff4d4d',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});
