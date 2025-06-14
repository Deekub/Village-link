import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';


export default function MainScreen({ navigation }) {

 const buttonText = {
 color: 'white',
 fontSize: 16,
 fontWeight: 'bold',
 };


 return (
 <View style={styles.container}>
 <TouchableOpacity style={styles.blueButton} onPress={() => navigation.navigate('Form')}>
 <Text style={buttonText}>ส่งข่าวสาร</Text>
 </TouchableOpacity>
 <View style={{ marginTop: 10 }} />
 <TouchableOpacity style={styles.blueButton} onPress={() => navigation.navigate('History')}>
 <Text style={buttonText}>ดูรายการข่าวที่ส่งแล้ว</Text>
 </TouchableOpacity>
 <View style={{ marginTop: 10 }} />
 <TouchableOpacity style={styles.blueButton} onPress={() => navigation.navigate('ChatAdmin')}>
 <Text style={buttonText}>ช่องแชท</Text>
 </TouchableOpacity>
 </View>
 );
}


const styles = StyleSheet.create({
 container: {
 flex: 1,
 justifyContent: 'center',
 padding: 20,
 backgroundColor: '#F0F0F0', // สีพื้นหลังสีเทาอ่อน
  alignItems: 'center',
  gap:7,
 },
 blueButton: {
 backgroundColor: '#2196F3', // สีฟ้าตามภาพ
 paddingVertical: 10,
 paddingHorizontal: 20,
 borderRadius: 5,
 alignItems: 'center',
 width: '50%',
 }
 
});