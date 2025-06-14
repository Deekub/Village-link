import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, Platform } from 'react-native';
import RNPickerSelect from 'react-native-picker-select';
import DateTimePicker from '@react-native-community/datetimepicker';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { ScrollView } from 'react-native-web';

const villages = [
    { label: 'หมู่ 1', value: 'หมู่ 1' },
    { label: 'หมู่ 2', value: 'หมู่ 2' },
    { label: 'หมู่ 3', value: 'หมู่ 3' },
    { label: 'หมู่ 4', value: 'หมู่ 4' },
    { label: 'หมู่ 5', value: 'หมู่ 5' },
    { label: 'หมู่ 6', value: 'หมู่ 6' },
    { label: 'หมู่ 7', value: 'หมู่ 7' },
    { label: 'หมู่ 8', value: 'หมู่ 8' },
    { label: 'หมู่ 9', value: 'หมู่ 9' },
    { label: 'หมู่ 10', value: 'หมู่ 10' },
];

const topics = [
    { label: 'ไฟฟ้า', value: 'ไฟฟ้า' },
    { label: 'ประปา', value: 'ประปา' },
    { label: 'อื่นๆ', value: 'อื่นๆ' },
];

const actions = [
    { label: 'ตัดไฟ', value: 'ตัดไฟ' },
    { label: 'ตัดน้ำ', value: 'ตัดน้ำ' },
    { label: 'อื่นๆ', value: 'อื่นๆ' },
];

// รวมวันที่กับเวลาเป็น Date เดียว
function combineDateAndTime(date, time) {
    const combined = new Date(date);
    combined.setHours(time.getHours());
    combined.setMinutes(time.getMinutes());
    combined.setSeconds(time.getSeconds());
    combined.setMilliseconds(time.getMilliseconds());
    return combined;
}

export default function FormScreen() {
    const [village, setVillage] = useState('');
    const [topic, setTopic] = useState('');
    const [action, setAction] = useState('');
    const [detail, setDetail] = useState('');
    const [notifyDate, setNotifyDate] = useState(new Date());
    const [notifyTime, setNotifyTime] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [repeatCount, setRepeatCount] = useState('');
    const [frequencyHour, setFrequencyHour] = useState('0');
    const [frequencyMinute, setFrequencyMinute] = useState('0');

    const handleSubmit = async () => {
        if (!village || !topic || !action || !detail || !repeatCount) {
            Alert.alert('กรุณากรอกข้อมูลให้ครบถ้วน');
            return;
        }

        const combinedDateTime = combineDateAndTime(notifyDate, notifyTime);
        const frequencyText = `ทุก ${frequencyHour} ชั่วโมง ${frequencyMinute} นาที`;

        console.log("Frequency : ", frequencyText);

        try {
            await addDoc(collection(db, 'news'), {
                village,
                topic,
                action,
                detail,
                notifyTime: Timestamp.fromDate(combinedDateTime),
                repeatCount: parseInt(repeatCount),
                frequency: frequencyText,
                createdAt: Timestamp.now(),
                sent: false,
            });

            // 🔥 เรียก API ไปหลังบ้าน (สมมุติว่า POST พร้อม body)
            await fetch('https://village-link.onrender.com/api/send-line', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: `📢 แจ้งข่าวจาก${village}\nหัวข้อ: ${topic}\nการจัดการ: ${action}\nรายละเอียด: ${detail}\nเวลา: ${combinedDateTime.toLocaleString()}`,
                }),
            });

            Alert.alert('บันทึกข้อมูลเรียบร้อย');

            // Reset ฟอร์ม
            setVillage('');
            setTopic('');
            setAction('');
            setDetail('');
            setRepeatCount('');
            setFrequencyHour('0');
            setFrequencyMinute('0');
            setNotifyDate(new Date());
            setNotifyTime(new Date());
        } catch (err) {
            console.error(err);
            Alert.alert('เกิดข้อผิดพลาด');
        }

    };

    return (
        <ScrollView>
            <View style={styles.container}>
                <Text style={styles.label}>เลือกหมู่บ้าน</Text>
                <RNPickerSelect
                    onValueChange={setVillage}
                    value={village}
                    items={villages}
                    placeholder={{ label: 'เลือกหมู่บ้าน', value: '' }}
                />

                <Text style={styles.label}>หัวข้อ</Text>
                <RNPickerSelect
                    onValueChange={setTopic}
                    value={topic}
                    items={topics}
                    placeholder={{ label: 'เลือกหัวข้อ', value: '' }}
                />

                <Text style={styles.label}>แจ้งการจัดการ</Text>
                <RNPickerSelect
                    onValueChange={setAction}
                    value={action}
                    items={actions}
                    placeholder={{ label: 'เลือกการจัดการ', value: '' }}
                />

                <Text style={styles.label}>รายละเอียด</Text>
                <TextInput
                    style={[styles.input, { height: 100 }]}
                    value={detail}
                    onChangeText={setDetail}
                    multiline
                    placeholder="รายละเอียดเพิ่มเติม"
                />

                {/* วันที่ */}
                <Text style={styles.label}>เลือกวันที่แจ้ง</Text>
                {Platform.OS === 'web' ? (
                    <input
                        type="date"
                        value={notifyDate.toISOString().split('T')[0]}
                        onChange={(e) => setNotifyDate(new Date(e.target.value + 'T00:00'))}
                        style={styles.webInput}
                    />
                ) : (
                    <>
                        <Button title={notifyDate.toLocaleDateString()} onPress={() => setShowDatePicker(true)} />
                        {showDatePicker && (
                            <DateTimePicker
                                value={notifyDate}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={(event, date) => {
                                    setShowDatePicker(false);
                                    if (date) setNotifyDate(date);
                                }}
                            />
                        )}
                    </>
                )}

                {/* เวลา */}
                <Text style={styles.label}>เลือกเวลาที่แจ้ง</Text>
                {Platform.OS === 'web' ? (
                    <input
                        type="time"
                        value={notifyTime.toTimeString().substring(0, 5)}
                        onChange={(e) => {
                            const [hours, minutes] = e.target.value.split(':');
                            const newTime = new Date();
                            newTime.setHours(Number(hours));
                            newTime.setMinutes(Number(minutes));
                            setNotifyTime(newTime);
                        }}
                        style={styles.webInput}
                    />
                ) : (
                    <>
                        <Button title={notifyTime.toLocaleTimeString()} onPress={() => setShowTimePicker(true)} />
                        {showTimePicker && (
                            <DateTimePicker
                                value={notifyTime}
                                mode="time"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={(event, date) => {
                                    setShowTimePicker(false);
                                    if (date) setNotifyTime(date);
                                }}
                            />
                        )}
                    </>
                )}

                <Text style={styles.label}>จำนวนครั้งการแจ้งเตือน</Text>
                <TextInput
                    style={styles.input}
                    value={repeatCount}
                    onChangeText={setRepeatCount}
                    keyboardType="numeric"
                    placeholder="เช่น 1, 2, 3"
                />

                <Text style={styles.label}>ความถี่ในการแจ้งเตือน</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                        <RNPickerSelect
                            onValueChange={setFrequencyHour}
                            value={frequencyHour}
                            items={[...Array(24).keys()].map((h) => ({ label: `${h} ชั่วโมง`, value: h.toString() }))}
                            placeholder={{ label: 'ชั่วโมง', value: '0' }}
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                        <RNPickerSelect
                            onValueChange={setFrequencyMinute}
                            value={frequencyMinute}
                            items={[0, 15, 30, 45].map((m) => ({ label: `${m} นาที`, value: m.toString() }))}
                            placeholder={{ label: 'นาที', value: '0' }}
                        />
                    </View>
                </View>

                <View style={{ marginTop: 20 }}>
                    <Button title="ส่งข่าว" onPress={handleSubmit} />
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { padding: 20 },
    label: { marginTop: 15, marginBottom: 5, fontWeight: 'bold' },
    input: {
        borderWidth: 1,
        borderColor: '#aaa',
        borderRadius: 8,
        padding: 10,
        backgroundColor: '#fff',
    },
    webInput: {
        padding: 10,
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#aaa',
        borderRadius: 8,
        width: '100%',
        marginBottom: 15,
    },
});
