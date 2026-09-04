import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, SafeAreaView,
  Image, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { supabase } from './lib/supabase';

const C = { bg: '#000', surface: '#121212', raised: '#1f1f1f', line: '#535353', text: '#fff', muted: '#b3b3b3', green: '#1ed760' };
type Values = { bass: number; mid: number; treble: number; ambience: number; gain: number };
type Profile = { id: string; name: string; values: Values };
type Account = { id: string; email: string; name: string; avatarPath?: string; avatarUrl?: string };
const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).map(word => word[0]).join('').toUpperCase() || '?';
const EMAIL_TYPOS: Record<string, string> = { 'gmai.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.co': 'gmail.com', 'hotnail.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'yaho.com': 'yahoo.com' };
const DEFAULTS: Profile[] = [
  { id: 'warm', name: 'Warm', values: { bass: 72, mid: 55, treble: 42, ambience: 28, gain: 64 } },
  { id: 'flat', name: 'Flat', values: { bass: 50, mid: 50, treble: 50, ambience: 20, gain: 58 } },
  { id: 'bright', name: 'Bright', values: { bass: 42, mid: 58, treble: 76, ambience: 24, gain: 56 } },
];

function Slider({ label, value, onChange, transition }: { label: string; value: number; onChange: (v: number) => void; transition: number }) {
  const [width, setWidth] = useState(1);
  const animatedValue = useRef(new Animated.Value(value)).current;
  const previousTransition = useRef(transition);
  const latest = useRef({ width, onChange });
  latest.current = { width, onChange };
  useEffect(() => {
    if (previousTransition.current !== transition) {
      previousTransition.current = transition;
      Animated.timing(animatedValue, { toValue: value, duration: 260, useNativeDriver: false }).start();
    } else {
      animatedValue.stopAnimation();
      animatedValue.setValue(value);
    }
  }, [value, transition, animatedValue]);
  const animatedPosition = animatedValue.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  const setFromX = (x: number) => latest.current.onChange(Math.round(Math.max(0, Math.min(100, x / latest.current.width * 100))));
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => setFromX(e.nativeEvent.locationX),
    onPanResponderMove: e => setFromX(e.nativeEvent.locationX),
  })).current;

  return (
    <View style={s.control}>
      <View style={s.controlTop}><Text style={s.controlLabel}>{label}</Text><Text style={s.controlValue}>{value}%</Text></View>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: value }}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
        style={s.touchTrack}
        {...pan.panHandlers}
      >
        <View style={s.track}>
          <Animated.View style={[s.fill, { width: animatedPosition }]} />
          <Animated.View style={[s.thumb, { left: animatedPosition }]} />
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>(DEFAULTS);
  const [selectedId, setSelectedId] = useState<string>('flat');
  const [values, setValues] = useState<Values>({ ...DEFAULTS[1].values });
  const [customValues, setCustomValues] = useState<Values>({ ...DEFAULTS[1].values });
  const [sliderTransition, setSliderTransition] = useState(0);
  const [saveOpen, setSaveOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [user, setUser] = useState<Account | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'create'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [avatarDraft, setAvatarDraft] = useState<string | undefined>();
  const [avatarMime, setAvatarMime] = useState<string | undefined>();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [emailWarning, setEmailWarning] = useState<{ email: string; suggestion: string } | null>(null);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const passwordConfirmRef = useRef<TextInput>(null);
  const currentPasswordRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);

  const showSaved = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastOpacity.stopAnimation();
    toastOpacity.setValue(0);
    Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    }, 850);
  };

  const loadCloudAccount = async (authUser: { id: string; email?: string }) => {
    const [{ data: settings }, { data: rows }] = await Promise.all([
      supabase.from('user_settings').select('username, avatar_path').eq('user_id', authUser.id).single(),
      supabase.from('sound_profiles').select('id, name, bass, mid, treble, ambience, gain').eq('user_id', authUser.id).order('created_at'),
    ]);
    let avatarUrl: string | undefined;
    if (settings?.avatar_path) {
      const { data } = await supabase.storage.from('avatars').createSignedUrl(settings.avatar_path, 3600);
      avatarUrl = data?.signedUrl;
    }
    const loaded: Profile[] = (rows ?? []).map(row => ({ id: row.id, name: row.name, values: { bass: row.bass, mid: row.mid, treble: row.treble, ambience: row.ambience, gain: row.gain } }));
    setUser({ id: authUser.id, email: authUser.email ?? '', name: settings?.username ?? authUser.email?.split('@')[0] ?? 'User', avatarPath: settings?.avatar_path ?? undefined, avatarUrl });
    setProfiles(loaded);
    if (loaded.length) { setSelectedId(loaded[0].id); setValues({ ...loaded[0].values }); }
    else setSelectedId('custom');
  };
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) loadCloudAccount(data.session.user); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setTimeout(() => loadCloudAccount(session.user), 0);
      else {
        setUser(null);
        setProfiles(DEFAULTS.map(p => ({ ...p, values: { ...p.values } })));
        setSelectedId('flat');
        setValues({ ...DEFAULTS[1].values });
        setCustomValues({ ...DEFAULTS[1].values });
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const selected = profiles.find(p => p.id === selectedId);
  const summary = useMemo(() => values.bass > values.treble + 10 ? 'Deep and warm' : values.treble > values.bass + 10 ? 'Crisp and bright' : 'Clean and balanced', [values]);
  const choose = (profile: Profile) => { setSelectedId(profile.id); setValues({ ...profile.values }); setSliderTransition(current => current + 1); };
  const chooseCustom = () => { setSelectedId('custom'); setValues({ ...customValues }); setSliderTransition(current => current + 1); };
  const update = (key: keyof Values, value: number) => {
    const next = { ...values, [key]: value };
    setCustomValues(next);
    setValues(next);
    setSelectedId('custom');
  };
  const remove = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from('sound_profiles').delete().eq('id', id).eq('user_id', user.id);
    if (error) return;
    const remaining = profiles.filter(p => p.id !== id);
    setProfiles(remaining);
    if (selectedId === id) {
      if (remaining.length) choose(remaining[0]);
      else chooseCustom();
    }
    setDeleteTarget(null);
    showSaved();
  };
  const save = async () => {
    if (!user) return;
    const clean = name.trim();
    if (!clean) return;
    const { data, error } = await supabase.from('sound_profiles').insert({ user_id: user.id, name: clean, ...values }).select('id').single();
    if (error || !data) return;
    const profile: Profile = { id: data.id, name: clean, values: { ...values } };
    setProfiles(current => [...current, profile]);
    setSelectedId(profile.id);
    setName('');
    setSaveOpen(false);
    showSaved();
  };
  const resetAuthForm = () => { setUsername(''); setEmail(''); setCurrentPassword(''); setPassword(''); setPasswordConfirm(''); setAuthError(''); };
  const submitAuth = async (allowCommonTypo = false, emailOverride?: string) => {
    const enteredLogin = (emailOverride ?? email).trim().toLowerCase();
    if (!enteredLogin || !password || (authMode === 'create' && !username.trim())) { setAuthError('Complete every field.'); return; }
    let cleanEmail = enteredLogin;
    if (authMode === 'login' && !enteredLogin.includes('@')) {
      const { data, error } = await supabase.rpc('resolve_login_email', { login_name: enteredLogin });
      if (error || !data) { setAuthError('Incorrect username/email or password.'); return; }
      cleanEmail = data;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) { setAuthError('Enter a valid email address.'); return; }
    const domain = cleanEmail.split('@')[1];
    if (enteredLogin.includes('@') && EMAIL_TYPOS[domain] && !allowCommonTypo) {
      setEmailWarning({ email: cleanEmail, suggestion: `${cleanEmail.split('@')[0]}@${EMAIL_TYPOS[domain]}` });
      return;
    }
    if (authMode === 'create') {
      if (password !== passwordConfirm) { setAuthError('Passwords do not match.'); return; }
      const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password, options: { data: { username: username.trim() } } });
      if (error) { setAuthError(error.message); return; }
      if (!data.session) { setAuthError('Account created. Check your email to confirm it, then log in.'); return; }
      setAuthOpen(false); resetAuthForm();
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (error) { setAuthError(error.message); return; }
      setAuthOpen(false); resetAuthForm();
    }
  };
  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.75 });
    if (!result.canceled) { setAvatarDraft(result.assets[0].uri); setAvatarMime(result.assets[0].mimeType ?? 'image/jpeg'); setAvatarFailed(false); }
  };
  const saveAccount = async () => {
    if (!user) return;
    const clean = username.trim();
    if (!clean) { setAuthError('Enter a username.'); return; }
    const changed = clean !== user.name || avatarDraft !== user.avatarUrl || !!password;
    if (!changed) { setAuthOpen(false); resetAuthForm(); return; }
    if (password && password !== passwordConfirm) { setAuthError('Passwords do not match.'); return; }
    if (password) {
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (error) { setAuthError('Current password is incorrect.'); return; }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setAuthError(updateError.message); return; }
    }
    let avatarPath = user.avatarPath;
    let avatarUrl = user.avatarUrl;
    if (avatarDraft && avatarDraft !== user.avatarUrl) {
      try {
        const mime = avatarMime === 'image/jpg' ? 'image/jpeg' : avatarMime ?? 'image/jpeg';
        const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
        avatarPath = `${user.id}/avatar-${Date.now()}.${extension}`;
        const bytes = await fetch(avatarDraft).then(response => response.arrayBuffer());
        const { error } = await supabase.storage.from('avatars').upload(avatarPath, bytes, { contentType: mime });
        if (error) throw error;
        const { data } = await supabase.storage.from('avatars').createSignedUrl(avatarPath, 3600);
        avatarUrl = data?.signedUrl;
      } catch (error) {
        setAuthError(`Could not save photo: ${error instanceof Error ? error.message : 'upload failed'}`);
        return;
      }
    } else if (!avatarDraft) { avatarPath = undefined; avatarUrl = undefined; }
    const { error: settingsError } = await supabase.from('user_settings').update({ username: clean, avatar_path: avatarPath ?? null, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    if (settingsError) { setAuthError(settingsError.message); return; }
    if (user.avatarPath && user.avatarPath !== avatarPath) {
      await supabase.storage.from('avatars').remove([user.avatarPath]);
    }
    setUser({ ...user, name: clean, avatarPath, avatarUrl });
    setAuthOpen(false);
    resetAuthForm();
    showSaved();
  };
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfiles(DEFAULTS.map(p => ({ ...p, values: { ...p.values } })));
    setSelectedId('flat');
    setValues({ ...DEFAULTS[1].values });
    setCustomValues({ ...DEFAULTS[1].values });
    setAuthOpen(false);
    resetAuthForm();
  };
  const deleteAccount = async () => {
    if (!user) return;
    const { error } = await supabase.rpc('delete_own_account');
    if (error) { setAuthError(error.message); setDeleteAccountOpen(false); return; }
    await supabase.auth.signOut();
    setUser(null);
    setProfiles(DEFAULTS.map(p => ({ ...p, values: { ...p.values } })));
    setSelectedId('flat');
    setValues({ ...DEFAULTS[1].values });
    setCustomValues({ ...DEFAULTS[1].values });
    setDeleteAccountOpen(false);
    setAuthOpen(false);
    resetAuthForm();
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <View><Text style={s.eyebrow}>SOUND PROFILE</Text><Text style={s.title}>Soundscape</Text></View>
          {user ? (
            <Pressable accessibilityLabel="Open account" onPress={() => { setUsername(user.name); setAvatarDraft(user.avatarUrl); setAvatarMime(undefined); setAvatarFailed(false); setAuthOpen(true); }} style={({ pressed }) => [s.avatar, pressed && s.pressed]}>
              {user.avatarUrl && !avatarFailed ? <Image source={{ uri: user.avatarUrl }} onError={() => setAvatarFailed(true)} style={s.avatarImage} /> : <Text style={s.avatarText}>{initials(user.name)}</Text>}
            </Pressable>
          ) : (
            <Pressable accessibilityLabel="Log in" onPress={() => setAuthOpen(true)} style={({ pressed }) => [s.loginButton, pressed && s.pressed]}>
              <Text style={s.loginButtonText}>Log in</Text>
            </Pressable>
          )}
        </View>

        <View style={s.hero}>
          <View style={s.record}><View style={s.recordRing} /><View style={s.recordDot} /></View>
          <View style={s.heroCopy}><Text style={s.overline}>ACTIVE PROFILE</Text><Text numberOfLines={1} style={s.heroTitle}>{selected?.name ?? 'Custom'}</Text><Text style={s.muted}>{summary}</Text></View>
          <View style={s.live}><View style={s.liveDot} /><Text style={s.liveText}>LIVE</Text></View>
        </View>

        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Your sound profiles</Text>
            {user && selected ? (
              <Pressable onPress={() => setDeleteTarget(selected)} style={({ pressed }) => [s.deleteHeaderButton, pressed && s.pressed]}>
                <Text style={s.deleteHeaderText}>Delete profile</Text>
              </Pressable>
            ) : user ? (
              <Pressable onPress={() => setSaveOpen(true)} style={({ pressed }) => [s.saveHeaderButton, pressed && s.pressed]}>
                <Text style={s.saveHeaderText}>Save profile</Text>
              </Pressable>
            ) : <View style={s.guestBadge}><Text style={s.guestBadgeText}>LOG IN TO MANAGE</Text></View>}
          </View>
          {profiles.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.presetRow}>
              {profiles.map(profile => {
                const active = selectedId === profile.id;
                return (
                  <View key={profile.id} style={[s.preset, active && s.presetActive]}>
                    <Pressable onPress={() => choose(profile)} style={s.presetName}>
                      <Text style={[s.presetText, active && s.presetTextActive]}>{active ? '✓  ' : ''}{profile.name}</Text>
                    </Pressable>
                  </View>
                );
              })}
              <Pressable onPress={chooseCustom} style={[s.preset, selectedId === 'custom' && s.presetActive, s.customPreset]}>
                <Text style={[s.presetText, selectedId === 'custom' && s.presetTextActive]}>{selectedId === 'custom' ? '✓  ' : ''}Custom</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <Pressable onPress={chooseCustom} style={[s.preset, s.presetActive, s.customPreset]}><Text style={[s.presetText, s.presetTextActive]}>✓  Custom</Text></Pressable>
          )}
        </View>

        <View style={s.panel}>
          <View style={s.panelHead}>
            <View><Text style={s.sectionTitle}>Tone controls</Text><Text style={s.helper}>Drag to fine-tune your sound</Text></View>
            {selectedId === 'custom' && <View style={s.customPill}><Text style={s.customText}>CUSTOM</Text></View>}
          </View>
          <Slider label="Bass" value={values.bass} onChange={v => update('bass', v)} transition={sliderTransition} />
          <Slider label="Midrange" value={values.mid} onChange={v => update('mid', v)} transition={sliderTransition} />
          <Slider label="Treble" value={values.treble} onChange={v => update('treble', v)} transition={sliderTransition} />
          <Slider label="Ambience" value={values.ambience} onChange={v => update('ambience', v)} transition={sliderTransition} />
        </View>

        <View style={s.panel}>
          <View style={s.outputHead}><View><Text style={s.sectionTitle}>Output level</Text><Text style={s.helper}>Overall profile gain</Text></View></View>
          <Slider label="Gain" value={values.gain} onChange={v => update('gain', v)} transition={sliderTransition} />
        </View>
        <Text style={s.footer}>Changes apply instantly to your turntable output.</Text>
      </ScrollView>

      <Modal visible={saveOpen} transparent animationType="fade" onRequestClose={() => setSaveOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSaveOpen(false)} />
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Name this profile</Text>
            <Text style={s.dialogCopy}>Save these settings to use them again anytime.</Text>
            <TextInput autoFocus value={name} onChangeText={setName} onSubmitEditing={save} placeholder="Profile name" placeholderTextColor="#777" selectionColor={C.green} maxLength={30} style={s.input} />
            <View style={s.dialogActions}>
              <Pressable onPress={() => { setSaveOpen(false); setName(''); }} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable>
              <Pressable disabled={!name.trim()} onPress={save} style={[s.confirm, !name.trim() && s.disabled]}><Text style={s.confirmText}>Save</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDeleteTarget(null)} />
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Delete {deleteTarget?.name}?</Text>
            <Text style={s.dialogCopy}>This profile will be removed permanently. This cannot be undone.</Text>
            <View style={s.dialogActions}>
              <Pressable onPress={() => setDeleteTarget(null)} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable>
              <Pressable onPress={() => deleteTarget && remove(deleteTarget.id)} style={s.deleteConfirm}><Text style={s.deleteConfirmText}>Delete</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={authOpen} transparent animationType="fade" onRequestClose={() => { setAuthOpen(false); resetAuthForm(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setAuthOpen(false); resetAuthForm(); }} />
          {user ? (
            <View style={s.dialog}>
              <Text style={s.dialogTitle}>Profile settings</Text>
              <Pressable onPress={pickAvatar} style={s.photoPicker}>
                {avatarDraft && !avatarFailed ? <Image source={{ uri: avatarDraft }} onError={() => setAvatarFailed(true)} style={s.photoPreview} /> : <View style={s.photoFallback}><Text style={s.photoInitials}>{initials(username || user.name)}</Text></View>}
                <Text style={s.photoAction}>{avatarDraft ? 'Change photo' : 'Add profile photo'}</Text>
              </Pressable>
              {!!avatarDraft && (
                <Pressable onPress={() => { setAvatarDraft(undefined); setAvatarMime(undefined); setAvatarFailed(false); }} style={s.removePhotoButton}>
                  <Text style={s.removePhotoText}>Remove photo</Text>
                </Pressable>
              )}
              <Text style={s.fieldLabel}>USERNAME</Text>
              <TextInput autoCapitalize="none" value={username} onChangeText={text => { setUsername(text); setAuthError(''); }} onSubmitEditing={() => currentPasswordRef.current?.focus()} returnKeyType="next" blurOnSubmit={false} placeholder="Username" placeholderTextColor="#777" selectionColor={C.green} style={s.input} />
              <Text style={s.fieldLabel}>CURRENT PASSWORD</Text>
              <TextInput ref={currentPasswordRef} secureTextEntry value={currentPassword} onChangeText={text => { setCurrentPassword(text); setAuthError(''); }} onSubmitEditing={() => newPasswordRef.current?.focus()} returnKeyType="next" blurOnSubmit={false} placeholder="Required to change password" placeholderTextColor="#777" selectionColor={C.green} style={s.input} />
              <Text style={s.fieldLabel}>NEW PASSWORD</Text>
              <TextInput ref={newPasswordRef} secureTextEntry value={password} onChangeText={text => { setPassword(text); setAuthError(''); }} onSubmitEditing={() => passwordConfirmRef.current?.focus()} returnKeyType="next" blurOnSubmit={false} placeholder="Leave blank to keep current" placeholderTextColor="#777" selectionColor={C.green} style={s.input} />
              <TextInput ref={passwordConfirmRef} secureTextEntry value={passwordConfirm} onChangeText={text => { setPasswordConfirm(text); setAuthError(''); }} onSubmitEditing={saveAccount} returnKeyType="done" placeholder="Repeat new password" placeholderTextColor="#777" selectionColor={C.green} style={s.input} />
              {!!authError && <Text style={s.errorText}>{authError}</Text>}
              <Pressable onPress={() => setDeleteAccountOpen(true)} style={s.deleteAccountLink}>
                <Text style={s.deleteAccountLinkText}>Delete account</Text>
              </Pressable>
              <View style={s.dialogActions}>
                <Pressable onPress={logout} style={s.logoutButton}><Text style={s.logoutText}>Log out</Text></Pressable>
                <View style={s.actionSpacer} />
                <Pressable onPress={() => { setAuthOpen(false); resetAuthForm(); }} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable>
                <Pressable onPress={saveAccount} style={s.confirm}><Text style={s.confirmText}>Save</Text></Pressable>
              </View>
            </View>
          ) : (
            <View style={s.dialog}>
              <Text style={s.dialogTitle}>{authMode === 'login' ? 'Log in' : 'Create account'}</Text>
              <Text style={s.dialogCopy}>{authMode === 'login' ? 'Access your personal sound profiles.' : 'Every new account starts with Warm, Flat, and Bright.'}</Text>
              {authMode === 'create' && <TextInput autoFocus value={username} onChangeText={text => { setUsername(text); setAuthError(''); }} onSubmitEditing={() => emailRef.current?.focus()} returnKeyType="next" blurOnSubmit={false} placeholder="Username" placeholderTextColor="#777" selectionColor={C.green} style={s.input} />}
              <TextInput ref={emailRef} autoFocus={authMode === 'login'} autoCapitalize="none" keyboardType={authMode === 'create' ? 'email-address' : 'default'} value={email} onChangeText={text => { setEmail(text); setAuthError(''); }} onSubmitEditing={() => passwordRef.current?.focus()} returnKeyType="next" blurOnSubmit={false} placeholder={authMode === 'login' ? 'Email or username' : 'Email'} placeholderTextColor="#777" selectionColor={C.green} style={s.input} />
              <TextInput ref={passwordRef} secureTextEntry value={password} onChangeText={text => { setPassword(text); setAuthError(''); }} onSubmitEditing={() => authMode === 'create' ? passwordConfirmRef.current?.focus() : submitAuth()} returnKeyType={authMode === 'create' ? 'next' : 'done'} blurOnSubmit={authMode !== 'create'} placeholder="Password" placeholderTextColor="#777" selectionColor={C.green} style={s.input} />
              {authMode === 'create' && <TextInput ref={passwordConfirmRef} secureTextEntry value={passwordConfirm} onChangeText={text => { setPasswordConfirm(text); setAuthError(''); }} onSubmitEditing={() => submitAuth()} returnKeyType="done" placeholder="Repeat password" placeholderTextColor="#777" selectionColor={C.green} style={s.input} />}
              {!!authError && <Text style={authError.startsWith('Account created') ? s.infoText : s.errorText}>{authError}</Text>}
              <Pressable onPress={() => { setAuthMode(authMode === 'login' ? 'create' : 'login'); setAuthError(''); }}>
                <Text style={s.switchAuth}>{authMode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}</Text>
              </Pressable>
              <View style={s.dialogActions}>
                <Pressable onPress={() => { setAuthOpen(false); resetAuthForm(); }} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable>
                <Pressable onPress={() => submitAuth()} style={s.confirm}><Text style={s.confirmText}>{authMode === 'login' ? 'Log in' : 'Create'}</Text></Pressable>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!emailWarning} transparent animationType="fade" onRequestClose={() => setEmailWarning(null)}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEmailWarning(null)} />
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Check your email</Text>
            <Text style={s.dialogCopy}>This email address contains a common typo. Are you sure it is correct?</Text>
            <View style={s.emailComparison}>
              <Text style={s.emailCaption}>YOU ENTERED</Text>
              <Text style={s.enteredEmail}>{emailWarning?.email}</Text>
              <Text style={s.emailCaption}>DID YOU MEAN?</Text>
              <Text style={s.suggestedEmail}>{emailWarning?.suggestion}</Text>
            </View>
            <Pressable
              onPress={() => {
                if (!emailWarning) return;
                const suggestion = emailWarning.suggestion;
                setEmail(suggestion);
                setEmailWarning(null);
                submitAuth(true, suggestion);
              }}
              style={s.useSuggestionButton}
            >
              <Text style={s.useSuggestionText}>Use suggested email</Text>
            </Pressable>
            <View style={s.dialogActions}>
              <Pressable onPress={() => { setEmailWarning(null); setTimeout(() => emailRef.current?.focus(), 150); }} style={s.cancel}><Text style={s.cancelText}>Edit email</Text></Pressable>
              <Pressable onPress={() => { setEmailWarning(null); submitAuth(true); }} style={s.confirm}><Text style={s.confirmText}>Use it anyway</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteAccountOpen} transparent animationType="fade" onRequestClose={() => setDeleteAccountOpen(false)}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDeleteAccountOpen(false)} />
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Delete your account?</Text>
            <Text style={s.dialogCopy}>Your account and every saved sound profile will be permanently deleted. This cannot be undone.</Text>
            <View style={s.dialogActions}>
              <Pressable onPress={() => setDeleteAccountOpen(false)} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable>
              <Pressable onPress={deleteAccount} style={s.deleteConfirm}><Text style={s.deleteConfirmText}>Delete account</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Animated.View pointerEvents="none" style={[s.savedToast, { opacity: toastOpacity }]}>
        <View style={s.savedToastDot} />
        <Text style={s.savedToastText}>Changes saved</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, page: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 36, gap: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { color: C.green, fontSize: 11, fontWeight: '800', letterSpacing: 1.8, marginBottom: 7 },
  title: { color: C.text, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 }, loginButton: { borderWidth: 1, borderColor: '#727272', borderRadius: 99, paddingHorizontal: 18, paddingVertical: 9 }, loginButtonText: { color: C.text, fontSize: 12, fontWeight: '800' }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, avatarImage: { width: '100%', height: '100%' }, avatarText: { color: C.text, fontWeight: '800', fontSize: 12 },
  hero: { minHeight: 142, padding: 20, borderRadius: 12, backgroundColor: C.raised, flexDirection: 'row', alignItems: 'center' }, record: { width: 70, height: 70, borderRadius: 8, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  recordRing: { position: 'absolute', width: 45, height: 45, borderRadius: 23, borderWidth: 2, borderColor: '#0d6f31' }, recordDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: '#0d6f31', borderWidth: 3, borderColor: C.green },
  heroCopy: { flex: 1 }, overline: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 5 }, heroTitle: { color: C.text, fontSize: 23, fontWeight: '800' }, muted: { color: C.muted, fontSize: 13, marginTop: 3 },
  live: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#173b24', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 5 }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green }, liveText: { color: C.green, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  section: { gap: 13 }, sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionTitle: { color: C.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.25 },
  presetRow: { gap: 8, paddingRight: 8 }, preset: { minHeight: 43, borderRadius: 99, borderWidth: 1, borderColor: '#727272', flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }, presetActive: { backgroundColor: C.green, borderColor: C.green },
  presetName: { paddingHorizontal: 16, paddingVertical: 11 }, customPreset: { paddingHorizontal: 16, paddingVertical: 11 }, presetText: { color: C.text, fontSize: 14, fontWeight: '700' }, presetTextActive: { color: C.bg, fontWeight: '800' },
  deleteHeaderButton: { minWidth: 102, alignItems: 'center', borderWidth: 1, borderColor: '#7f7f7f', borderRadius: 99, paddingHorizontal: 13, paddingVertical: 7 }, deleteHeaderText: { color: C.text, fontSize: 11, fontWeight: '800' },
  saveHeaderButton: { minWidth: 102, alignItems: 'center', backgroundColor: C.green, borderWidth: 1, borderColor: C.green, borderRadius: 99, paddingHorizontal: 13, paddingVertical: 7 }, saveHeaderText: { color: C.bg, fontSize: 11, fontWeight: '800' },
  guestBadge: { minWidth: 102, alignItems: 'center', paddingVertical: 8 }, guestBadgeText: { color: '#777', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  panel: { backgroundColor: C.surface, borderRadius: 12, padding: 18, gap: 22 }, panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }, helper: { color: C.muted, fontSize: 13, marginTop: 5 },
  customPill: { backgroundColor: '#173b24', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 6 }, customText: { color: C.green, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  control: { gap: 5 }, controlTop: { flexDirection: 'row', justifyContent: 'space-between' }, controlLabel: { color: C.text, fontSize: 14, fontWeight: '700' }, controlValue: { color: C.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  touchTrack: { height: 30, justifyContent: 'center' }, track: { height: 4, borderRadius: 99, backgroundColor: C.line }, fill: { height: '100%', borderRadius: 99, backgroundColor: C.green }, thumb: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: C.text, top: -6, marginLeft: -8 },
  outputHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -4 }, outputValue: { color: C.green, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  footer: { color: '#6a6a6a', fontSize: 12, textAlign: 'center', marginTop: -10 }, pressed: { opacity: 0.72 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', justifyContent: 'center', padding: 24 }, dialog: { backgroundColor: '#282828', borderRadius: 12, padding: 24, gap: 14 },
  dialogTitle: { color: C.text, fontSize: 23, fontWeight: '800' }, dialogCopy: { color: C.muted, fontSize: 14, lineHeight: 20 }, input: { height: 50, borderWidth: 1, borderColor: '#777', borderRadius: 5, paddingHorizontal: 14, color: C.text, backgroundColor: '#333', fontSize: 16 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 4 }, cancel: { paddingHorizontal: 14, paddingVertical: 11 }, cancelText: { color: C.text, fontWeight: '700' }, confirm: { backgroundColor: C.green, borderRadius: 99, paddingHorizontal: 24, paddingVertical: 12 }, confirmText: { color: C.bg, fontWeight: '800' }, disabled: { opacity: 0.35 },
  deleteConfirm: { backgroundColor: '#e91429', borderRadius: 99, paddingHorizontal: 24, paddingVertical: 12 }, deleteConfirmText: { color: C.text, fontWeight: '800' },
  errorText: { color: '#ff6b6b', fontSize: 13 }, infoText: { color: C.green, fontSize: 13, lineHeight: 18 }, switchAuth: { color: C.green, fontSize: 13, fontWeight: '700' }, fieldLabel: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: -7 }, photoPicker: { alignItems: 'center', gap: 9, marginVertical: 2 }, photoPreview: { width: 76, height: 76, borderRadius: 38 }, photoFallback: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#3a3a3a', alignItems: 'center', justifyContent: 'center' }, photoInitials: { color: C.text, fontSize: 21, fontWeight: '800' }, photoAction: { color: C.green, fontSize: 13, fontWeight: '800' }, removePhotoButton: { alignSelf: 'center', marginTop: -8, paddingHorizontal: 12, paddingVertical: 5 }, removePhotoText: { color: '#ff6574', fontSize: 12, fontWeight: '700' }, logoutButton: { borderWidth: 1, borderColor: '#e91429', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 11 }, logoutText: { color: '#ff6574', fontWeight: '800' }, actionSpacer: { flex: 1 },
  deleteAccountLink: { alignSelf: 'flex-start', paddingVertical: 4 }, deleteAccountLinkText: { color: '#ff6574', fontSize: 13, fontWeight: '800' },
  emailComparison: { backgroundColor: '#333', borderRadius: 8, padding: 14, gap: 5 }, emailCaption: { color: '#888', fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 3 }, enteredEmail: { color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 7 }, suggestedEmail: { color: C.green, fontSize: 14, fontWeight: '800' },
  useSuggestionButton: { minHeight: 46, borderRadius: 99, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }, useSuggestionText: { color: C.bg, fontSize: 13, fontWeight: '800' },
  savedToast: { position: 'absolute', bottom: 24, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#282828', borderRadius: 99, paddingHorizontal: 18, paddingVertical: 11, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 }, savedToastDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green }, savedToastText: { color: C.text, fontSize: 13, fontWeight: '800' },
});
