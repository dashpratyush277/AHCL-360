import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme';

/** Navy AHCL header used on the Home tabs: logo, greeting, subtitle and notifications bell. */
export default function BrandHeader({ title, subtitle, unread }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.navy, borderRadius: 16, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Image source={require('../../assets/logo-white.png')} style={{ width: 96, height: 64 }} resizeMode="contain" accessibilityLabel="AHCL" />
        <Pressable
          onPress={() => router.push('/common/notifications')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={unread ? `${unread} unread notifications` : 'Notifications'}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
          {unread > 0 && (
            <View style={{ position: 'absolute', top: 6, right: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#E5484D', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </Pressable>
      </View>
      <View>
        <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800' }} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={{ color: '#CFE3F5', fontSize: 13 }}>{subtitle}</Text> : null}
      </View>
      <View style={{ width: 36, height: 3, borderRadius: 2, backgroundColor: t.accent }} />
    </View>
  );
}
