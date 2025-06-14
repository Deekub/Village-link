import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, Platform, TouchableOpacity } from 'react-native';
import RNPickerSelect from 'react-native-picker-select';
import DateTimePicker from '@react-native-community/datetimepicker';
import { collection, addDoc, Timestamp } from 'firebase/firestore'; // นำกลับมา
import { db } from '../firebaseConfig'; // นำกลับมา
import { ScrollView } from 'react-native';
const { addDoc, collection } = require('firebase/firestore');

const villages = [
    { label: 'หมู่ 1', value: '1' },
    { label: 'หมู่ 2', value: '2' },
    { label: 'หมู่ 3', value: '3' },
    { label: 'หมู่ 4', value: '4' },
    { label: 'หมู่ 5', value: '5' },
    { label: 'หมู่ 6', value: '6' },
    { label: 'หมู่ 7', value: '7' },
    { label: 'หมู่ 8', value: '8' },
    { label: 'หมู่ 9', value: '9' },
    { label: 'หมู่ 10', value: '10' },
];

const topics = [
    { label: 'ไฟฟ้า', value: 'ไฟฟ้า' },
    { label: 'ประปา', value: 'ประปา' },
    { label: 'อื่นๆ', value: 'อื่นๆ' },
];

const actions = [
    { label: 'ตัดไฟ', value: 'ตัดไฟ' },
    { label: 'ตัดน้ำ', value: 'ตัดน้ำ' },
    { label: 'ซ่อมสายไฟ', value: 'ซ่อมสายไฟ' },
    { label: 'อื่นๆ', value: 'อื่นๆ' },
];

// ฟังก์ชันรวมวันที่และเวลา
function combineDateAndTime(date, time) {
    const combined = new Date(date);
    combined.setHours(time.getHours());
    combined.setMinutes(time.getMinutes());
    combined.setSeconds(time.getSeconds());
    combined.setMilliseconds(time.getMilliseconds());
    return combined;
}

// ฟังก์ชัน alert แยกเว็บกับแอพมือถือ
const showAlert = (message) => {
    if (Platform.OS === 'web') {
        window.alert(message);
    } else {
        Alert.alert(message);
    }
};

// แปลงวันที่สำหรับแสดงผล
const displayDate = (date) => {
    const d = new Date(date);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// แปลงเวลาสำหรับแสดงผล
const displayTime = (date) => {
    const d = new Date(date);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};


export default function FormScreen() {
    const [village, setVillage] = useState('');
    const [topic, setTopic] = useState('');
    const [action, setAction] = useState('');
    const [detail, setDetail] = useState('');
    const [fixHour, setFixHour] = useState('0');
    const [fixMinute, setFixMinute] = useState('0');
    const [notifyDate, setNotifyDate] = useState(new Date());
    const [notifyTime, setNotifyTime] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [repeatCount, setRepeatCount] = useState('0');
    const [frequencyHour, setFrequencyHour] = useState('0');
    const [frequencyMinute, setFrequencyMinute] = useState('0');
    const [sendSms, setSendSms] = useState(false);

    const onChangeDate = (event, selectedDate) => {
        const currentDate = selectedDate || notifyDate;
        setShowDatePicker(Platform.OS === 'ios');
        setNotifyDate(currentDate);
    };

    const onChangeTime = (event, selectedTime) => {
        const currentTime = selectedTime || notifyTime;
        setShowTimePicker(Platform.OS === 'ios');
        setNotifyTime(currentTime);
    };

    const handleSubmit = async () => {
        // ตรวจสอบข้อมูลเบื้องต้น
        if (!village || !topic || !action || !detail) {
            showAlert('กรุณากรอกข้อมูล หัวข้อ, การจัดการ, รายละเอียด, และเลือกหมู่บ้าน ให้ครบถ้วน');
            return;
        }

        const rc = parseInt(repeatCount);
        const fh = parseInt(frequencyHour);
        const fm = parseInt(frequencyMinute);
        const fih = parseInt(fixHour);
        const fim = parseInt(fixMinute);

        if (isNaN(rc) || rc < 0) {
            showAlert('จำนวนครั้งการแจ้งเตือนต้องเป็นตัวเลขและมากกว่าหรือเท่ากับ 0');
            return;
        }

        if (rc > 1 && (fh === 0 && fm < 15)) {
             showAlert('ถ้ามีการแจ้งเตือนมากกว่า 1 ครั้ง, กรุณาระบุความถี่อย่างน้อย 15 นาที');
             return;
        }

        if (isNaN(fih) || isNaN(fim) || fih < 0 || fim < 0) {
            showAlert('เวลาดำเนินการโดยประมาณต้องเป็นตัวเลขและมากกว่าหรือเท่ากับ 0');
            return;
        }
        if (fih === 0 && fim === 0) {
            showAlert('กรุณาระบุเวลาดำเนินการโดยประมาณ (ชั่วโมง/นาที)');
            return;
        }


        // รวมวันที่และเวลาที่ดำเนินการ
        const combinedDateTime = combineDateAndTime(notifyDate, notifyTime);

        try {
            // *** บันทึกข้อมูลลงใน collection 'news' ที่ Frontend ***
            await addDoc(collection(db, 'news'), {
                village,
                topic,
                action,
                detail,
                notifyTime: Timestamp.fromDate(combinedDateTime),
                fixHour: fih,
                fixMinute: fim,
                repeatCount: rc,
                frequencyHour: fh,
                frequencyMinute: fm,
                sendSms: sendSms, // บันทึกสถานะการส่ง SMS ใน Firestore ของ Frontend ด้วย
                createdAt: Timestamp.now(),
                sent: true, // ตั้งค่าเป็น true เพราะ Frontend ถือว่าส่งข้อมูลไปยังระบบแล้ว (Backend จะจัดการการส่งจริง)
            });

            // *** เรียก Backend เพื่อส่ง LINE และ SMS ***
            const response = await fetch('https://village-link.onrender.com/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    village,
                    topic,
                    action,
                    detail,
                    notifyTime: combinedDateTime.toISOString(), // ส่งเป็น ISO string
                    fixHour: fih,
                    fixMinute: fim,
                    repeatCount: rc,
                    frequencyHour: fh,
                    frequencyMinute: fm,
                    sendSms,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                showAlert(`ส่งข่าวสารเรียบร้อย!\nLINE: ${data.lineSentCount} ข้อความ\nSMS: ${data.smsNumbersNotified} ข้อความ`);
                // เคลียร์ฟอร์มเมื่อส่งสำเร็จ
                setVillage('');
                setTopic('');
                setAction('');
                setDetail('');
                setFixHour('0');
                setFixMinute('0');
                setRepeatCount('0');
                setFrequencyHour('0');
                setFrequencyMinute('0');
                setSendSms(false);
                setNotifyDate(new Date());
                setNotifyTime(new Date());
            } else {
                showAlert(`เกิดข้อผิดพลาดในการส่ง: ${data.error || response.statusText}`);
                console.error("Backend Error:", data.details || data.error);
            }
        } catch (err) {
            console.error('Error in handleSubmit:', err); // Log ข้อผิดพลาดให้ละเอียดขึ้น
            showAlert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ หรือเกิดข้อผิดพลาดในการส่งข้อมูล');
        }
    };

    return (
        <ScrollView contentContainerStyle={styles.scrollContainer}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerVillage}>ตำบลสุรนารี</Text>
                    <Text style={styles.headerVillage}>หมู่บ้านก้าวสุระ</Text>
                </View>

                {/* Dropdowns */}
                <Text style={styles.label}>เลือกหมู่บ้าน</Text>
                <RNPickerSelect
                    onValueChange={setVillage}
                    value={village}
                    items={villages}
                    placeholder={{ label: 'เลือกหมู่บ้าน', value: '' }}
                    style={pickerSelectStyles}
                />

                <Text style={styles.label}>หัวข้อ</Text>
                <RNPickerSelect
                    onValueChange={setTopic}
                    value={topic}
                    items={topics}
                    placeholder={{ label: 'เลือกหัวข้อ', value: '' }}
                    style={pickerSelectStyles}
                />

                <Text style={styles.label}>การจัดการ</Text>
                <RNPickerSelect
                    onValueChange={setAction}
                    value={action}
                    items={actions}
                    placeholder={{ label: 'แจ้งการจัดการ', value: '' }}
                    style={pickerSelectStyles}
                />

                <Text style={styles.label}>รายละเอียด</Text>
                <TextInput
                    style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                    value={detail}
                    onChangeText={setDetail}
                    multiline
                    placeholder="รายละเอียดเพิ่มเติม"
                />

                {/* วันที่และเวลาดำเนินการ */}
                <View style={styles.dateTimeContainer}>
                    <View style={styles.dateTimeGroup}>
                        <Text style={styles.label}>เลือกวันที่แจ้ง</Text>
                        {Platform.OS === 'web' ? (
                            <input
                                type="date"
                                value={notifyDate.toISOString().split('T')[0]}
                                onChange={(e) => setNotifyDate(new Date(e.target.value + 'T00:00:00'))}
                                style={styles.webDateInput}
                            />
                        ) : (
                            <>
                                <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowDatePicker(true)}>
                                    <Text style={styles.datePickerButtonText}>{displayDate(notifyDate)}</Text>
                                </TouchableOpacity>
                                {showDatePicker && (
                                    <DateTimePicker
                                        value={notifyDate}
                                        mode="date"
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        onChange={onChangeDate}
                                    />
                                )}
                            </>
                        )}
                    </View>

                    <View style={styles.dateTimeGroup}>
                        <Text style={styles.label}>เลือกเวลาดำเนินการ</Text>
                        {Platform.OS === 'web' ? (
                            <input
                                type="time"
                                value={displayTime(notifyTime)}
                                onChange={(e) => {
                                    const [hours, minutes] = e.target.value.split(':');
                                    const newTime = new Date();
                                    newTime.setHours(Number(hours));
                                    newTime.setMinutes(Number(minutes));
                                    setNotifyTime(newTime);
                                }}
                                style={styles.webTimeInput}
                            />
                        ) : (
                            <>
                                <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowTimePicker(true)}>
                                    <Text style={styles.datePickerButtonText}>{displayTime(notifyTime)}</Text>
                                </TouchableOpacity>
                                {showTimePicker && (
                                    <DateTimePicker
                                        value={notifyTime}
                                        mode="time"
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        onChange={onChangeTime}
                                    />
                                )}
                            </>
                        )}
                    </View>
                </View>

                {/* เวลาดำเนินการโดยประมาณ */}
                <Text style={styles.label}>เวลาดำเนินการโดยประมาณ</Text>
                <View style={styles.inlineInputs}>
                    <TextInput
                        style={styles.smallInput}
                        value={fixHour}
                        onChangeText={text => setFixHour(text.replace(/[^0-9]/g, ''))}
                        keyboardType="numeric"
                        placeholder="0"
                    />
                    <Text style={styles.unitText}>ชั่วโมง</Text>
                    <TextInput
                        style={styles.smallInput}
                        value={fixMinute}
                        onChangeText={text => setFixMinute(text.replace(/[^0-9]/g, ''))}
                        keyboardType="numeric"
                        placeholder="0"
                    />
                    <Text style={styles.unitText}>นาที</Text>
                </View>

                {/* การแจ้งเตือน */}
                <Text style={styles.label}>การแจ้งเตือน</Text>
                <View style={styles.inlineInputs}>
                    <TextInput
                        style={styles.smallInput}
                        value={repeatCount}
                        onChangeText={text => setRepeatCount(text.replace(/[^0-9]/g, ''))}
                        keyboardType="numeric"
                        placeholder="0"
                    />
                    <Text style={styles.unitText}>ครั้ง</Text>
                    <Text style={styles.unitText}>ความถี่ในการแจ้งเตือน :</Text>
                    <TextInput
                        style={styles.smallInput}
                        value={frequencyHour}
                        onChangeText={text => setFrequencyHour(text.replace(/[^0-9]/g, ''))}
                        keyboardType="numeric"
                        placeholder="0"
                    />
                    <Text style={styles.unitText}>ชั่วโมง</Text>
                    <TextInput
                        style={styles.smallInput}
                        value={frequencyMinute}
                        onChangeText={text => setFrequencyMinute(text.replace(/[^0-9]/g, ''))}
                        keyboardType="numeric"
                        placeholder="0"
                    />
                    <Text style={styles.unitText}>นาที</Text>
                </View>

                {/* Checkbox ส่ง SMS */}
                <View style={styles.checkboxContainer}>
                    <TouchableOpacity
                        style={[styles.checkbox, sendSms && styles.checkboxChecked]}
                        onPress={() => setSendSms(!sendSms)}
                    >
                        {sendSms && <Text style={styles.checkboxCheckmark}>✓</Text>}
                    </TouchableOpacity>
                    <Text style={styles.checkboxLabel}>ส่ง SMS</Text>
                </View>

                {/* ปุ่มส่งข่าวสาร */}
                <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
                    <Text style={styles.submitButtonText}>ส่งข่าวสาร</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollContainer: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingVertical: 20,
        backgroundColor: '#f0f2f5',
    },
    container: {
        padding: 20,
        backgroundColor: '#fff',
        borderRadius: 10,
        marginHorizontal: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
    header: {
        marginBottom: 20,
        alignItems: 'center',
        backgroundColor: '#e6e6fa',
        paddingVertical: 10,
        borderRadius: 8,
    },
    headerVillage: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#4b0082',
    },
    label: {
        marginTop: 15,
        marginBottom: 8,
        fontWeight: 'bold',
        fontSize: 16,
        color: '#333',
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 12,
        backgroundColor: '#f9f9f9',
        fontSize: 16,
        color: '#333',
    },
    webDateInput: {
        height: 40,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 10,
        fontSize: 16,
        backgroundColor: '#f9f9f9',
        color: '#333',
        width: '100%',
    },
    webTimeInput: {
        height: 40,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 10,
        fontSize: 16,
        backgroundColor: '#f9f9f9',
        color: '#333',
        width: '100%',
    },
    dateTimeContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        marginBottom: 10,
    },
    dateTimeGroup: {
        width: '48%',
    },
    datePickerButton: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 12,
        backgroundColor: '#f9f9f9',
        alignItems: 'center',
    },
    datePickerButtonText: {
        fontSize: 16,
        color: '#333',
    },
    inlineInputs: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 10,
    },
    smallInput: {
        width: 60,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 8,
        backgroundColor: '#f9f9f9',
        textAlign: 'center',
        fontSize: 16,
        color: '#333',
    },
    unitText: {
        fontSize: 16,
        color: '#555',
        marginRight: 10,
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 30,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderWidth: 2,
        borderColor: '#4b0082',
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
        backgroundColor: '#f9f9f9',
    },
    checkboxChecked: {
        backgroundColor: '#4b0082',
    },
    checkboxCheckmark: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    checkboxLabel: {
        fontSize: 16,
        color: '#333',
    },
    submitButton: {
        backgroundColor: '#4b0082',
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 20,
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

const pickerSelectStyles = StyleSheet.create({
    inputIOS: {
        fontSize: 16,
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        color: 'black',
        paddingRight: 30,
        backgroundColor: '#f9f9f9',
        marginBottom: 10,
    },
    inputAndroid: {
        fontSize: 16,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        color: 'black',
        paddingRight: 30,
        backgroundColor: '#f9f9f9',
        marginBottom: 10,
    },
    placeholder: {
        color: '#999',
    },
});