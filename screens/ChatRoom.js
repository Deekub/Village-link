import React, { useEffect, useState, useRef } from 'react';

const API_BASE = 'https://village-link.onrender.com';

export default function ChatAdmin() {
    const [users, setUsers] = useState([]);
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const messagesEndRef = useRef(null);

    // โหลดรายชื่อ user พร้อม unread count
    useEffect(() => {
        fetch(`${API_BASE}/line-users`)
            .then(res => res.json())
            .then(data => {
                setUsers(data.map(user => ({
                    ...user,
                    userId: user.id || user.userId,
                    hasUnread: user.unreadCount > 0,
                })));
            })
            .catch(console.error);
    }, []);

    // โหลดข้อความแชทเมื่อเลือก user
    useEffect(() => {
        if (!selectedUserId) return;

        fetch(`${API_BASE}/messages/${selectedUserId}`)
            .then(res => res.json())
            .then(data => {
                setMessages(data.messages);

                // ทำให้ข้อความอ่านแล้ว
                fetch(`${API_BASE}/mark-as-read/${selectedUserId}`, { method: 'POST' }).catch(console.error);

                // อัปเดต users ให้จุดแดงหาย
                setUsers(prevUsers => prevUsers.map(u =>
                    u.userId === selectedUserId ? { ...u, hasUnread: false } : u
                ));
            })
            .catch(console.error);
    }, [selectedUserId]);

    // scroll ลงล่างอัตโนมัติเมื่อ messages เปลี่ยน
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // ส่งข้อความตอบกลับ
    async function sendMessage() {
        if (!inputText.trim()) return;

        try {
            const res = await fetch(`${API_BASE}/send-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: selectedUserId,
                    message: inputText.trim(),
                }),
            });
            if (!res.ok) throw new Error('Failed to send message');

            setMessages(prev => [...prev, {
                direction: 'out',
                message: inputText.trim(),
                timestamp: Date.now(),
            }]);
            setInputText('');
        } catch (error) {
            alert(error.message);
        }
    }

    // ฟังก์ชันแสดงเวลา
    function formatTimestamp(ts) {
        if (!ts) return '';
        let date;
        if (typeof ts === 'object' && ts.seconds) {
            date = new Date(ts.seconds * 1000);
        } else if (!isNaN(Number(ts))) {
            date = new Date(Number(ts));
        } else {
            return '';
        }
        return date.toLocaleString('th-TH');
    }

    return (
        <div style={{ display: 'flex', height: '90vh', fontFamily: 'Arial, sans-serif' }}>
            {/* รายชื่อผู้ใช้ */}
            <div style={{ width: 250, borderRight: '1px solid #ccc', padding: '1rem', overflowY: 'auto' }}>
                <h3>Users</h3>
                {users.length === 0 && <p>No users found</p>}
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {users.map((user, index) => (
                        <li
                            key={user.userId || index}
                            onClick={() => setSelectedUserId(user.userId)}
                            style={{
                                cursor: 'pointer',
                                padding: '8px 12px',
                                borderBottom: '1px solid #eee',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                backgroundColor: user.userId === selectedUserId ? '#e6f0ff' : 'transparent',
                            }}
                        >
                            <span>{user.label || user.userId}</span>
                            {user.hasUnread && (
                                <span
                                    style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: '50%',
                                        backgroundColor: 'red',
                                        display: 'inline-block',
                                        marginLeft: 8,
                                    }}
                                />
                            )}
                        </li>
                    ))}
                </ul>
            </div>

            {/* แชท */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', borderBottom: '1px solid #ccc' }}>
                    {!selectedUserId && <p>Select a user to see chat</p>}
                    {selectedUserId && messages.map((msg, idx) => (
                        <div
                            key={idx}
                            style={{
                                textAlign: msg.direction === 'in' ? 'left' : 'right',
                                marginBottom: 12,
                            }}
                        >
                            <div style={{
                                display: 'inline-block',
                                backgroundColor: msg.direction === 'in' ? '#f1f0f0' : '#0084ff',
                                color: msg.direction === 'in' ? '#000' : '#fff',
                                padding: '8px 12px',
                                borderRadius: 16,
                                maxWidth: '70%',
                                wordBreak: 'break-word',
                                fontSize: 14,
                            }}>
                                {msg.message}
                            </div>
                            <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
                                {formatTimestamp(msg.timestamp)}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* ส่งข้อความ */}
                {selectedUserId && (
                    <div style={{ padding: '1rem', display: 'flex', gap: 8 }}>
                        <input
                            type="text"
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                            style={{ flex: 1, padding: 8, fontSize: 14 }}
                            placeholder="Type your message..."
                            onKeyDown={e => e.key === 'Enter' && sendMessage()}
                        />
                        <button onClick={sendMessage} style={{ padding: '8px 16px' }}>
                            Send
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
