import { useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { DEFAULT_API_URL, getApiUrl, setApiUrl, testApiUrl } from '../lib/api';
import { Button, Card, Input, Row, T } from './ui';

/** Collapsible "Server address" panel on the login screen (for test builds and on-site demos). */
export default function ServerSettings() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(getApiUrl());
  const [status, setStatus] = useState(null); // null | 'checking' | 'ok' | 'fail'

  const test = async () => {
    setStatus('checking');
    setStatus((await testApiUrl(url)) ? 'ok' : 'fail');
  };
  const save = async () => {
    setStatus('checking');
    if (!(await testApiUrl(url))) {
      setStatus('fail');
      return Alert.alert('Server not reachable', 'Check the address, that the server is running, and that the phone is on the same network.');
    }
    await setApiUrl(url);
    setStatus('ok');
    setOpen(false);
  };

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} hitSlop={10}>
        <T muted size={12} style={{ textAlign: 'center' }}>Server: {getApiUrl()}  ·  Change</T>
      </Pressable>
    );
  }
  return (
    <Card title="Server address">
      <Input value={url} onChangeText={(v) => { setUrl(v); setStatus(null); }} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://192.168.1.10:4000/api" />
      {status === 'ok' && <T size={12}>✓ Server reachable</T>}
      {status === 'fail' && <T size={12}>✗ Cannot reach this server</T>}
      <Row>
        <Button small variant="ghost" title="Test" loading={status === 'checking'} onPress={test} />
        <Button small title="Save" onPress={save} />
        <Button small variant="ghost" title="Reset" onPress={() => { setUrl(DEFAULT_API_URL); setStatus(null); }} />
      </Row>
    </Card>
  );
}
