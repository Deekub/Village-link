// App.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainScreen from './screens/MainScreen';
import FormScreen from './screens/FormScreen';
import HistoryScreen from './screens/HistoryScreen';
import ChatAdmin from './screens/ChatRoom';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Main">
        <Stack.Screen name="Main" component={MainScreen} options={{ title: 'หน้าหลัก' }} />
        <Stack.Screen name="Form" component={FormScreen} options={{ title: 'ส่งข่าวสาร' }} />
        <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'รายการที่ส่งแล้ว' }} />
        <Stack.Screen name="ChatAdmin" component={ChatAdmin} options={{ title: 'ช่องแชท' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
