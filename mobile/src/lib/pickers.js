import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

/** Let the user take a photo, pick from gallery, or pick a PDF. Resolves to [{uri,name,mimeType}] or []. */
export function pickAttachment() {
  return new Promise((resolve) => {
    const options = ['Take photo', 'Choose from gallery', 'Choose PDF / file', 'Cancel'];
    const handle = async (i) => {
      try {
        if (i === 0) {
          const p = await ImagePicker.requestCameraPermissionsAsync();
          if (!p.granted) return resolve([]);
          const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
          return resolve(r.canceled ? [] : r.assets.map(toAsset));
        }
        if (i === 1) {
          const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsMultipleSelection: true });
          return resolve(r.canceled ? [] : r.assets.map(toAsset));
        }
        if (i === 2) {
          const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true });
          return resolve(r.canceled ? [] : r.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType })));
        }
        resolve([]);
      } catch (e) {
        Alert.alert('Could not attach file', e.message);
        resolve([]);
      }
    };
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 3 }, handle);
    else Alert.alert('Attach', undefined, [...options.slice(0, 3).map((t, i) => ({ text: t, onPress: () => handle(i) })), { text: 'Cancel', style: 'cancel', onPress: () => resolve([]) }]);
  });
}

const toAsset = (a) => ({ uri: a.uri, name: a.fileName || `photo-${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg' });
