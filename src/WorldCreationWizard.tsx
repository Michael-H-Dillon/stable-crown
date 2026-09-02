import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { C } from './theme';
import { buildWorldRequest, canAdvanceWorldStep, emptyWorldAnswers, WorldAnswers, worldWizardSteps } from './worldWizard';

export function WorldCreationWizard({ visible, onClose, onGenerate }: {
  visible: boolean;
  onClose: () => void;
  onGenerate: (request: ReturnType<typeof buildWorldRequest>, title: string) => Promise<void>;
}) {
  const [answers, setAnswers] = useState({ ...emptyWorldAnswers });
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const update = (key: keyof WorldAnswers, value: string) => setAnswers(a => ({ ...a, [key]: value }));
  const go = (next: number) => { setStep(next); setError(''); scroll.current?.scrollTo({ y: 0, animated: false }); };
  const copy = { color: C.muted, fontSize: 14, lineHeight: 21 };
  const field = (key: keyof WorldAnswers, label: string, placeholder: string, required = false) => (
    <View style={{ gap: 8 }}>
      <Text style={{ color: C.parchment, fontSize: 15, fontWeight: '600' }}>{label}{!required && ' · optional'}</Text>
      <TextInput accessibilityLabel={label} editable={!busy} value={answers[key]} onChangeText={value => update(key, value)}
        placeholder={placeholder} placeholderTextColor={C.muted} multiline maxLength={2000} textAlignVertical="top"
        style={{ color: C.white, backgroundColor: C.coal, borderWidth: 1, borderColor: C.line, padding: 13, minHeight: 90, fontSize: 15, lineHeight: 22 }} />
    </View>
  );
  const choices = (key: keyof WorldAnswers, label: string, options: string[]) => (
    <View style={{ gap: 9 }}>
      <Text style={{ color: C.parchment, fontWeight: '600' }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map(option => <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: answers[key] === option }}
          onPress={() => update(key, answers[key] === option && key !== 'basis' ? '' : option)}
          style={{ padding: 12, minHeight: 44, borderWidth: 1, borderColor: answers[key] === option ? C.gold : C.line, backgroundColor: answers[key] === option ? C.raised : C.coal }}>
          <Text style={{ color: answers[key] === option ? C.gold : C.parchment }}>{option}</Text>
        </Pressable>)}
      </View>
    </View>
  );
  const existing = answers.basis === 'Existing setting';
  const titles = ['Which world would you like to build?', existing ? 'When and where?' : 'What kind of world is it?', 'Ready to build your world?'];
  const hints = ['Choose an existing setting or invent your own. Your world can be reused across campaigns.', existing ? 'We’ll use the setting’s lore for everything else.' : 'Just the basics. The AI will develop the places, factions, and history.', 'You’ll choose your character and their story when you create a campaign.'];
  const button = (label: string, action: () => void, primary = false, disabled = false) => <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={action}
    style={{ paddingHorizontal: 17, paddingVertical: 13, minHeight: 46, borderWidth: 1, borderColor: primary ? C.gold : C.line, backgroundColor: primary ? C.gold : C.panel, opacity: disabled ? 0.45 : 1 }}>
    <Text style={{ color: primary ? C.ink : C.parchment, fontWeight: '700', textAlign: 'center' }}>{label}</Text>
  </Pressable>;

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#000000D8', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
      <View style={{ width: '100%', maxWidth: 580, maxHeight: '94%', backgroundColor: C.panel, borderWidth: 1, borderColor: C.goldSoft }}>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 22, gap: 20 }}>
          <Text style={{ color: C.gold, fontSize: 12, letterSpacing: 2 }}>CREATE YOUR WORLD · {step + 1} OF 3</Text>
          <View accessibilityLabel={`Step ${step + 1} of 3: ${worldWizardSteps[step]}`} style={{ flexDirection: 'row', gap: 5 }}>
            {worldWizardSteps.map((name, i) => <View key={name} style={{ flex: 1, height: 3, backgroundColor: i <= step ? C.gold : C.line }} />)}
          </View>
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="header" style={{ color: C.white, fontSize: 25, fontFamily: Platform.OS === 'web' ? 'Georgia' : 'serif' }}>{titles[step]}</Text>
            <Text style={copy}>{hints[step]}</Text>
          </View>
          {step === 0 && <>
            {choices('basis', 'Start with…', ['Existing setting', 'Original world'])}
            {field('world', existing ? 'Which setting?' : 'What shall we call your world?', existing ? 'A Song of Ice and Fire (books), Fallout, Middle-earth…' : 'A name for your original world', true)}
            <Text style={copy}>20 Crowns to generate and save. You’ll confirm before anything is spent.</Text>
          </>}
          {step === 1 && <>
            {existing ? <>
              {field('era', 'What time period?', 'Just before the War of the Five Kings, during Robert’s Rebellion…', true)}
              {field('region', 'Where should we focus?', 'Westeros, the Riverlands, or leave blank for the wider world…')}
            </> : <>
              {choices('genre', 'Choose a genre', ['Fantasy', 'Post-apocalyptic', 'Science fiction', 'Historical', 'Modern mystery', 'A mix'])}
              {field('description', 'Describe the basic idea', 'A gritty fantasy kingdom with rival houses, or a wasteland rebuilding after a nuclear war…', true)}
              {field('era', 'When is it set?', 'A medieval age, 200 years after the collapse…')}
              {field('region', 'Where should we focus?', 'A divided kingdom, a ruined city, a frontier planet…')}
            </>}
          </>}
          {step === 2 && <>
            {([
              ['Setting', `${answers.basis}\n${answers.world}`, 0],
              ['World basics', [!existing && answers.genre, !existing && answers.description, answers.era, answers.region || 'The wider world'].filter(Boolean).join('\n'), 1],
            ] as const).map(([label, value, index]) => <View key={label} style={{ gap: 8, paddingBottom: 14, borderBottomWidth: 1, borderColor: C.line }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: C.gold, fontWeight: '600', flex: 1 }}>{label}</Text>
                <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={`Edit ${label}`} onPress={() => go(index)} style={{ padding: 12 }}><Text style={{ color: C.gold }}>Edit</Text></Pressable>
              </View>
              <Text style={{ ...copy, color: C.parchment }}>{value}</Text>
            </View>)}
            <Text style={copy}>We’ll build the setting, history, places, and factions. Characters and the opening scene are prepared for each campaign.</Text>
            <Text style={copy}>Only generate settings you are entitled to use. Worlds remain private and use concise summaries and source links.</Text>
            <Text style={copy}>20 Crowns total: 18 for generation, 2 for validation and storage. Reserved when the job starts and released if generation ultimately fails.</Text>
          </>}
          {!!error && <Text accessibilityRole="alert" style={{ color: '#E28B84', lineHeight: 21 }}>{error}</Text>}
        </ScrollView>
        <View style={{ padding: 16, gap: 10, borderTopWidth: 1, borderColor: C.line }}>
          {step === 2 ? button(busy ? 'Reserving Crowns…' : 'Generate my world · 20 Crowns', async () => {
            if (submitting.current || !canAdvanceWorldStep(2, answers)) return;
            submitting.current = true; setBusy(true); setError('');
            try {
              await onGenerate(buildWorldRequest(answers), answers.world.trim());
              setAnswers({ ...emptyWorldAnswers }); go(0); onClose();
            } catch (e) { setError(e instanceof Error ? e.message : 'Your world could not be queued. Please try again.'); }
            finally { submitting.current = false; setBusy(false); }
          }, true, busy || !canAdvanceWorldStep(2, answers)) : button(step === 1 ? 'Review my world →' : 'Continue →', () => go(step + 1), true, !canAdvanceWorldStep(step, answers))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            {button('Cancel', onClose, false, busy)}
            {step > 0 && button('← Back', () => go(step - 1), false, busy)}
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
