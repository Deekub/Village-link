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

// แปลงวันที่เป็น วว/ดด/ปปปป
const formatDate = (date) => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
};

// แปลงเวลาเป็น hh:mm (24 ชั่วโมง)
const formatTime24 = (date) => {
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${min}`;
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
    const [repeatCount, setRepeatCount] = useState('');
    const [frequencyHour, setFrequencyHour] = useState('0');
    const [frequencyMinute, setFrequencyMinute] = useState('0');

    const handleSubmit = async () => {
        if (!village || !topic || !action || !detail || !repeatCount) {
            showAlert('กรุณากรอกข้อมูลให้ครบถ้วน');
            return;
        }

        const fh = parseInt(frequencyHour) || 0;
        const fm = parseInt(frequencyMinute) || 0;
        const rc = parseInt(repeatCount);

        if (fh === 0 && fm === 0) {
            // อนุญาตถ้า repeatCount มากกว่า 1 ให้ส่งได้
        } else if (fh === 0 && fm > 0 && fm < 15) {
            showAlert('กรุณาระบุความถี่อย่างน้อย 15 นาที');
            return;
        }

        const combinedDateTime = combineDateAndTime(notifyDate, notifyTime);
        const finishRepairTime = new Date(
            combinedDateTime.getTime() + (parseInt(fixHour) * 60 + parseInt(fixMinute)) * 60 * 1000
        );

        // แปลงวันที่และเวลาให้ตรงตามที่ขอ
        const notifyDateFormatted = formatDate(combinedDateTime);
        const notifyTimeFormatted = formatTime24(combinedDateTime);
        const finishRepairTimeFormatted = formatTime24(finishRepairTime);

        const frequencyText = `ทุก ${fh} ชั่วโมง ${fm} นาที`;


        const fixtimereturn = ({ fixHour }, { fixMinute }) => {
            const hour = parseInt(fixHour)
            const min = parseInt(fixMinute);
            if (hour == 0) {
                console.log("No hour");
                return `${fixMinute} นาที`;
            } else {
                console.log("have hour", hour);
                return `${fixHour} ชั่วโมง ${fixMinute} นาที`;
            }
        };

        const fixTimeText = fixtimereturn({ fixHour }, { fixMinute });

        console.log("fixtime text :", fixTimeText)

        const messageText = `📢 แจ้งข่าวบริเวณ ${village} 📢
🏷️หัวข้อ: ${topic}
⚙️การจัดการ: ${action}
📝รายละเอียด: ${detail}
📅 ณ วันที่: ${notifyDateFormatted}
⏰เวลา: ${notifyTimeFormatted} น.
⏰ใช้เวลา : ${fixTimeText}
📅เวลาเสร็จสิ้นประมาณ: ${finishRepairTimeFormatted} น.`;

        try {
            await addDoc(collection(db, 'news'), {
                village,
                topic,
                action,
                detail,
                notifyTime: Timestamp.fromDate(combinedDateTime),
                repeatCount: rc,
                frequency: frequencyText,
                fixTime: fixTimeText,
                createdAt: Timestamp.now(),
                sent: false,
            });

            await fetch('https://village-link.onrender.com/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: messageText,
                }),
            });

            showAlert('บันทึกข้อมูลเรียบร้อย');

            // เคลียร์ฟอร์ม
            setVillage('');
            setTopic('');
            setAction('');
            setDetail('');
            setFixHour('0');
            setFixMinute('0');
            setRepeatCount('');
            setFrequencyHour('0');
            setFrequencyMinute('0');
            setNotifyDate(new Date());
            setNotifyTime(new Date());
        } catch (err) {
            console.error(err);
            showAlert('เกิดข้อผิดพลาด');
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

                <Text style={styles.label}>เวลาจัดการโดยประมาณ</Text>
                <View style={styles.rowWrap}>
                    <View style={styles.timeGroup}>
                        <TextInput
                            style={styles.timeInput}
                            value={fixHour}
                            onChangeText={setFixHour}
                            keyboardType="numeric"
                            placeholder="ชั่วโมง"
                        />
                        <Text style={styles.timeLabel}>ชั่วโมง</Text>
                    </View>
                    <View style={styles.timeGroup}>
                        <TextInput
                            style={styles.timeInput}
                            value={fixMinute}
                            onChangeText={setFixMinute}
                            keyboardType="numeric"
                            placeholder="นาที"
                        />
                        <Text style={styles.timeLabel}>นาที</Text>
                    </View>
                </View>

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

                <Text style={styles.label}>เลือกเวลาที่ดำเนินการ</Text>
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

                <Text style={styles.label}>ความถี่ในการแจ้งเตือน (เลือกได้)</Text>
                <View style={styles.rowWrap}>
                    <View style={styles.timeGroup}>
                        <TextInput
                            style={styles.timeInput}
                            value={frequencyHour}
                            onChangeText={setFrequencyHour}
                            keyboardType="numeric"
                            placeholder="ชั่วโมง"
                        />
                        <Text style={styles.timeLabel}>ชั่วโมง</Text>
                    </View>
                    <View style={styles.timeGroup}>
                        <TextInput
                            style={styles.timeInput}
                            value={frequencyMinute}
                            onChangeText={setFrequencyMinute}
                            keyboardType="numeric"
                            placeholder="นาที"
                        />
                        <Text style={styles.timeLabel}>นาที (ขั้นต่ำ 15 นาที)</Text>
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
    subLabel: {
        marginTop: 10,
        marginBottom: 5,
        fontWeight: '600',
    },
    rowWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
        marginTop: 5,
        marginBottom: 10,
    },

    timeGroup: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    timeInput: {
        width: 70,
        borderWidth: 1,
        borderColor: '#aaa',
        borderRadius: 8,
        padding: 8,
        backgroundColor: '#fff',
        textAlign: 'center',
        marginRight: 6,
    },

    timeLabel: {
        fontWeight: '500',
    },
});
