// screens/NewsFormScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function NewsFormScreen() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = async () => {
    if (!title || !content) {
      Alert.alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    try {
      await addDoc(collection(db, 'news'), {
        title,
        content,
        createdAt: Timestamp.now(),
        sent: false, // สำหรับ Cloud Function ตรวจว่ายังไม่ส่ง LINE
      });
      Alert.alert('บันทึกข่าวสำเร็จ');
      setTitle('');
      setContent('');
    } catch (error) {
      console.error('Error adding document: ', error);
      Alert.alert('เกิดข้อผิดพลาด');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>เพิ่มข่าวสาร</Text>
      <TextInput
        style={styles.input}
        placeholder="หัวข้อข่าว"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={[styles.input, { height: 100 }]}
        placeholder="รายละเอียดข่าว"
        value={content}
        onChangeText={setContent}
        multiline
      />
      <Button title="ส่งข่าว" onPress={handleSubmit} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, flex: 1, justifyContent: 'center' },
  heading: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#aaa',
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
});
