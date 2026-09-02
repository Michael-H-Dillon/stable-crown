import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  TextProps,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as Notifications from "expo-notifications";
import {
  AppData,
  Campaign,
  CampaignSetupOptions,
  Character,
  FactionWealthTier,
  NamedEntry,
  WorldPack,
} from "../src/types";
import {
  clearData,
  initialData,
  loadData,
  loadNarrationConfirmationPreference,
  loadPasswordRecoveryPending,
  saveData,
  saveNarrationConfirmationPreference,
  setPasswordRecoveryPending,
  AccessibilityPreferences,
  defaultAccessibilityPreferences,
  loadAccessibilityPreferences,
  saveAccessibilityPreferences,
} from "../src/storage";
import { defaultWorld, openingNarration } from "../src/defaultWorld";
import { submitTurn as submitLocalTurn } from "../src/engine";
import {
  estimatePackImportCredits,
  findLocationNameConflicts,
  LocationNameConflict,
  normalizeWorldPackInput,
  resolveLocationNameConflict,
  validatePack,
} from "../src/packSchema";
import { downloadableWorldPackTemplate } from "../src/worldPackTemplate";
import { applyAppTheme, C } from "../src/theme";
import {
  hasPasswordRecoveryUrl,
  isSupabaseConfigured,
  supabase,
} from "../src/backend/supabase";
import {
  applyStateChanges,
  authenticateUsername,
  BackgroundJob,
  createRemoteCampaign,
  deleteRemoteAccount,
  deleteRemoteCampaign,
  deleteRemoteWorldPack,
  generateOpeningNarration,
  generateTurnNarration,
  getWorldDatabase,
  getWorldJobNotificationPreferences,
  listRemoteBackgroundJobs,
  loadRemoteAppData,
  queueRemoteWorldPack,
  quoteCampaignSetup,
  quoteOpeningNarration,
  quoteTurnNarration,
  registerWorldJobPushToken,
  requestAccountRecovery,
  saveRemoteWorldPack,
  saveTurnResponseFeedback,
  setWorldJobNotificationPreferences,
  signOutRemote,
  submitRemoteTurn,
  updateRecoveredPassword,
  updateRemoteCampaignMetadata,
  listRemoteNarrationAvailability,
  queueRemoteCampaignContext,
} from "../src/backend/repository";

type Screen =
  | "auth"
  | "reset-password"
  | "home"
  | "character"
  | "play"
  | "intel"
  | "packs"
  | "builder"
  | "settings"
  | "store";
let activeAccessibility = defaultAccessibilityPreferences;
const textScale = { small: 0.9, default: 1, large: 1.15, 'extra-large': 1.3 } as const;
function Text({ style, ...props }: TextProps) {
  const preferences = activeAccessibility;
  const flattened = StyleSheet.flatten(style) || {};
  const scale = textScale[preferences.textSize];
  const fontFamily = preferences.font === 'serif'
    ? Platform.select({ web: 'Georgia', default: 'serif' })
    : preferences.font === 'readable'
      ? Platform.select({ web: 'Verdana', default: 'sans-serif' })
      : undefined;
  return (
    <NativeText
      {...props}
      style={[
        style,
        {
          ...(typeof flattened.fontSize === 'number' ? { fontSize: flattened.fontSize * scale } : scale !== 1 ? { fontSize: 14 * scale } : {}),
          ...(typeof flattened.lineHeight === 'number' ? { lineHeight: flattened.lineHeight * scale } : {}),
          ...(fontFamily ? { fontFamily } : {}),
        },
      ]}
    />
  );
}
const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = (Math.random() * 16) | 0;
    return (token === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });

function Button({
  label,
  onPress,
  kind = "primary",
  icon,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "ghost" | "danger";
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        kind === "ghost" && s.buttonGhost,
        kind === "danger" && s.buttonDanger,
        (pressed || disabled) && { opacity: 0.65 },
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={17}
          color={kind === "ghost" ? C.parchment : C.ink}
        />
      )}
      <Text style={[s.buttonText, kind === "ghost" && { color: C.parchment }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={s.modalBackdrop}>
        <Pressable
          accessibilityLabel="Close confirmation"
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
        />
        <View accessibilityRole="alert" style={s.modalCard}>
          <View style={[s.modalIcon, danger && { borderColor: C.red }]}>
            <Ionicons
              name={danger ? "warning-outline" : "sparkles-outline"}
              size={28}
              color={danger ? "#E28B84" : C.gold}
            />
          </View>
          <Text style={s.modalTitle}>{title}</Text>
          <Text style={s.modalBody}>{body}</Text>
          <View style={s.modalActions}>
            <Button label="Cancel" kind="ghost" onPress={onCancel} />
            <Button
              label={confirmLabel}
              kind={danger ? "danger" : "primary"}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CampaignValidationDialog({
  errors,
  onClose,
  onReview,
}: {
  errors: string[];
  onClose: () => void;
  onReview: () => void;
}) {
  return (
    <Modal
      visible={errors.length > 0}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.modalBackdrop}>
        <View accessibilityRole="alert" style={[s.modalCard, s.storyErrorCard]}>
          <View
            style={[
              s.modalIcon,
              { borderColor: C.gold, backgroundColor: "#282116" },
            ]}
          >
            <Ionicons name="clipboard-outline" size={30} color={C.gold} />
          </View>
          <Text style={s.modalTitle}>Finish setting up your campaign</Text>
          <Text style={s.modalBody}>
            Complete the following before stepping into the story:
          </Text>
          <View style={{ width: "100%", gap: 8 }}>
            {errors.map((message) => (
              <View key={message} style={s.errorAssurance}>
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color={C.gold}
                />
                <Text style={[s.errorAssuranceText, { color: C.parchment }]}>
                  {message}
                </Text>
              </View>
            ))}
          </View>
          <View style={s.modalActions}>
            <Button label="Close" kind="ghost" onPress={onClose} />
            <Button
              label="Review missing fields"
              icon="create-outline"
              onPress={onReview}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ImportConfirmDialog({
  pack,
  balance,
  importing,
  onCancel,
  onConfirm,
}: {
  pack: WorldPack | null;
  balance: number;
  importing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cost = pack ? estimatePackImportCredits(pack) : 0;
  return (
    <Modal
      visible={!!pack}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={s.modalBackdrop}>
        <View accessibilityRole="alert" style={s.modalCard}>
          <View style={s.modalIcon}>
            <Ionicons name="sparkles-outline" size={28} color={C.gold} />
          </View>
          <Text style={s.modalTitle}>Import this private world?</Text>
          <Text style={s.modalBody}>
            {pack
              ? `“${pack.metadata.title}” has passed validation. This JSON import costs ${cost} Crowns. You currently have ${balance} Crowns.`
              : ""}
          </Text>
          <View style={s.importInfoBar}>
            <Ionicons
              name="information-circle-outline"
              size={24}
              color={C.gold}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.noticeTitle}>Why does importing use Crowns?</Text>
              <Text style={s.importInfoText}>
                Sable Crown checks the pack for broken references and ambiguous
                records, prepares its locations, characters, rules, secrets, and
                opening state, and saves an immutable private version. This
                preparation helps the AI game master identify the right people
                and places, maintain continuity, and avoid mixing lore during
                play.
              </Text>
              <Text style={s.importInfoFine}>
                No AI runs during a JSON import. The fixed 2-Crown charge covers
                validation and private version storage. Failed imports are never
                charged.
              </Text>
            </View>
          </View>
          <View style={s.modalActions}>
            <Button label="Cancel" kind="ghost" onPress={onCancel} />
            <Button
              label={importing ? "Importing…" : `Import for ${cost} Crowns`}
              disabled={importing || balance < cost}
              onPress={onConfirm}
            />
          </View>
          {balance < cost && (
            <Text style={s.error}>
              You need {cost - balance} more Crowns to import this world.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

function NarrationConfirmDialog({
  quote,
  generating,
  skipFuture,
  onSkipChange,
  onCancel,
  onConfirm,
}: {
  quote: { cost: number; estimatedTokens: number } | null;
  generating: boolean;
  skipFuture: boolean;
  onSkipChange: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      visible={!!quote}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={s.modalBackdrop}>
        <View accessibilityRole="alert" style={s.modalCard}>
          <View style={s.modalIcon}>
            <Ionicons name="volume-high-outline" size={28} color={C.gold} />
          </View>
          <Text style={s.modalTitle}>Generate AI narration?</Text>
          <Text style={s.modalBody}>
            {quote
              ? `This passage contains approximately ${quote.estimatedTokens} text tokens and costs ${quote.cost} Crown${quote.cost === 1 ? "" : "s"} to narrate.`
              : ""}
          </Text>
          <View style={s.importInfoBar}>
            <Ionicons
              name="information-circle-outline"
              size={22}
              color={C.gold}
            />
            <Text style={s.importInfoText}>
              An AI-generated narrator will read this passage. The audio remains
              available for free replay for seven days. You can download a
              personal copy during that period. If generation fails, the charge
              is refunded automatically.
            </Text>
          </View>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: skipFuture }}
            onPress={() => onSkipChange(!skipFuture)}
            style={s.confirmCheck}
          >
            <Ionicons
              name={skipFuture ? "checkbox" : "square-outline"}
              size={22}
              color={C.gold}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.optionName}>Don’t ask me again</Text>
              <Text style={s.optionCopy}>
                Future narration will generate immediately when I press Narrate.
                Narration will never autoplay.
              </Text>
            </View>
          </Pressable>
          <View style={s.modalActions}>
            <Button label="Cancel" kind="ghost" onPress={onCancel} />
            <Button
              label={
                generating
                  ? "Generating…"
                  : quote
                    ? `Generate for ${quote.cost} Crown${quote.cost === 1 ? "" : "s"}`
                    : "Generate"
              }
              disabled={generating}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TurnFeedbackDialog({
  turnId,
  saving,
  onCancel,
  onHelpful,
  onSubmit,
}: {
  turnId: string;
  saving: boolean;
  onCancel: () => void;
  onHelpful: () => void;
  onSubmit: (category: "continuity" | "character" | "pacing" | "tone" | "outcome" | "other", explanation: string) => void;
}) {
  const [category, setCategory] = useState<"continuity" | "character" | "pacing" | "tone" | "outcome" | "other">("continuity");
  const [explanation, setExplanation] = useState("");
  const [needsImprovement, setNeedsImprovement] = useState(false);
  useEffect(() => { setCategory("continuity"); setExplanation(""); setNeedsImprovement(false); }, [turnId]);
  const choices = [
    ["continuity", "Continuity"], ["character", "Character behaviour"],
    ["pacing", "Pacing"], ["tone", "Tone"], ["outcome", "Outcome"], ["other", "Something else"],
  ] as const;
  return (
    <Modal visible={!!turnId} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.modalBackdrop}>
        <View accessibilityRole="alert" style={s.modalCard}>
          <View style={s.modalIcon}><Ionicons name="chatbox-ellipses-outline" size={28} color={C.gold} /></View>
          <Text style={s.modalTitle}>{needsImprovement ? "What should have been better?" : "How was this response?"}</Text>
          <Text style={s.modalBody}>Feedback helps shape upcoming responses in this campaign without rewriting established events.</Text>
          {!needsImprovement ? (
            <View style={s.feedbackRatingChoices}>
              <Pressable disabled={saving} onPress={onHelpful} style={s.feedbackRatingChoice}>
                <Ionicons name="thumbs-up-outline" size={22} color={C.gold} />
                <Text style={s.goldText}>Good</Text>
              </Pressable>
              <Pressable disabled={saving} onPress={() => setNeedsImprovement(true)} style={s.feedbackRatingChoice}>
                <Ionicons name="thumbs-down-outline" size={22} color={C.gold} />
                <Text style={s.goldText}>Bad</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={s.feedbackChoices}>
                {choices.map(([value, label]) => (
                  <Pressable key={value} onPress={() => setCategory(value)} style={[s.feedbackChoice, category === value && s.feedbackChoiceActive]}>
                    <Text style={category === value ? s.feedbackChoiceTextActive : s.goldText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput multiline maxLength={1000} value={explanation} onChangeText={setExplanation} placeholder="Optional: tell us what felt wrong and what you expected instead…" placeholderTextColor={C.muted} style={s.feedbackExplanation} />
            </>
          )}
          <View style={s.modalActions}>
            <Button label="Cancel" kind="ghost" disabled={saving} onPress={onCancel} />
            {needsImprovement && <Button label={saving ? "Saving…" : "Send feedback"} disabled={saving} onPress={() => onSubmit(category, explanation)} />}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function LocationConflictDialog({
  conflict,
  remaining,
  onCancel,
  onResolve,
}: {
  conflict: LocationNameConflict | null;
  remaining: number;
  onCancel: () => void;
  onResolve: (
    action: "rename" | "keep" | "merge",
    primaryId?: string,
    customNames?: Record<string, string>,
  ) => void;
}) {
  const [metrics, setMetrics] = useState({
    content: 1,
    viewport: 1,
    offset: 0,
  });
  const [editingNames, setEditingNames] = useState(false);
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const listRef = useRef<ScrollView>(null);
  useEffect(() => {
    setMetrics((value) => ({ ...value, offset: 0 }));
    setEditingNames(false);
    setCustomNames(
      Object.fromEntries(
        (conflict?.entries || []).map((entry) => [
          entry.id,
          `${entry.name} (${entry.id.replaceAll("-", " ")})`,
        ]),
      ),
    );
    listRef.current?.scrollTo({ y: 0, animated: false });
  }, [conflict?.normalizedName]);
  const trackHeight = Math.max(1, metrics.viewport - 10);
  const thumbHeight = Math.max(
    34,
    Math.min(trackHeight, (trackHeight * metrics.viewport) / metrics.content),
  );
  const maxOffset = Math.max(1, metrics.content - metrics.viewport);
  const thumbTop =
    5 +
    Math.min(1, metrics.offset / maxOffset) *
      Math.max(0, trackHeight - thumbHeight);
  const otherCount = Math.max(1, (conflict?.entries.length || 2) - 1);
  const removeOthersLabel = `Use this version and remove ${otherCount === 1 ? "the other entry" : `the other ${otherCount} entries`}`;
  const customNamesValid =
    conflict?.entries.every(
      (entry) => customNames[entry.id]?.trim().length >= 2,
    ) &&
    new Set(
      conflict?.entries.map((entry) =>
        customNames[entry.id]?.trim().toLocaleLowerCase(),
      ),
    ).size === conflict?.entries.length;
  return (
    <Modal
      visible={!!conflict}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={s.modalBackdrop}>
        <View accessibilityRole="alert" style={[s.modalCard, s.conflictCard]}>
          <View style={s.modalIcon}>
            <Ionicons name="git-compare-outline" size={28} color={C.gold} />
          </View>
          <Text style={s.modalTitle}>Are these different places?</Text>
          <Text style={s.modalBody}>
            {conflict
              ? `Your pack contains ${conflict.entries.length} places named “${conflict.entries[0].name}”. Read their descriptions, then choose whether they are separate places or duplicate entries. ${remaining} name conflict${remaining === 1 ? "" : "s"} remaining.`
              : ""}
          </Text>
          <View style={s.differentPlacesChoice}>
            <Text style={s.noticeTitle}>They are different places</Text>
            <Text style={s.optionCopy}>
              Keep every entry and give each one a distinct name:
            </Text>
            {editingNames
              ? conflict?.entries.map((entry) => (
                  <View key={entry.id} style={s.customNameField}>
                    <Text style={s.conflictId}>{entry.id}</Text>
                    <TextInput
                      value={customNames[entry.id] || ""}
                      onChangeText={(value) =>
                        setCustomNames((names) => ({
                          ...names,
                          [entry.id]: value,
                        }))
                      }
                      placeholder="Enter a unique location name"
                      placeholderTextColor="#687074"
                      style={s.input}
                    />
                  </View>
                ))
              : conflict?.entries.map((entry) => (
                  <Text key={entry.id} style={s.conflictPreview}>
                    • {entry.name} ({entry.id.replaceAll("-", " ")})
                  </Text>
                ))}
            {editingNames ? (
              <>
                <Button
                  label="Keep all places with my names"
                  icon="checkmark-outline"
                  disabled={!customNamesValid}
                  onPress={() => onResolve("rename", undefined, customNames)}
                />
                <Button
                  label="Use suggested names instead"
                  kind="ghost"
                  onPress={() => setEditingNames(false)}
                />
              </>
            ) : (
              <>
                <Button
                  label={`Keep all ${conflict?.entries.length || 0} places with these names`}
                  icon="create-outline"
                  onPress={() => onResolve("rename")}
                />
                <Button
                  label="Choose names myself"
                  kind="ghost"
                  icon="pencil-outline"
                  onPress={() => setEditingNames(true)}
                />
              </>
            )}
          </View>
          <Text style={s.conflictDivider}>
            OR, IF THEY DESCRIBE THE SAME PLACE
          </Text>
          <View style={s.conflictScrollWrap}>
            <ScrollView
              ref={listRef}
              style={s.conflictList}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onLayout={(event) =>
                setMetrics((value) => ({
                  ...value,
                  viewport: event.nativeEvent.layout.height,
                }))
              }
              onContentSizeChange={(_, height) =>
                setMetrics((value) => ({ ...value, content: height }))
              }
              onScroll={(event) =>
                setMetrics((value) => ({
                  ...value,
                  offset: event.nativeEvent.contentOffset?.y ?? 0,
                }))
              }
              contentContainerStyle={s.conflictListContent}
            >
              {conflict?.entries.map((entry) => (
                <View key={entry.id} style={s.conflictEntry}>
                  <Text style={s.optionName}>{entry.name}</Text>
                  <Text style={s.conflictId}>{entry.id}</Text>
                  <Text style={s.optionCopy}>{entry.description}</Text>
                  <View style={s.conflictActions}>
                    <Button
                      label={removeOthersLabel}
                      kind="ghost"
                      onPress={() => onResolve("merge", entry.id)}
                    />
                  </View>
                </View>
              ))}
            </ScrollView>
            {metrics.content > metrics.viewport + 2 && (
              <View pointerEvents="none" style={s.conflictScrollTrack}>
                <View
                  style={[
                    s.conflictScrollThumb,
                    { height: thumbHeight, top: thumbTop },
                  ]}
                />
              </View>
            )}
          </View>
          <Text style={s.fine}>
            Choosing one version removes the other duplicate entries and safely
            redirects known location references to this one.
          </Text>
          <View style={s.modalActions}>
            <Button label="Cancel import" kind="ghost" onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AccountDeleteDialog({
  visible,
  password,
  error,
  deleting,
  onPasswordChange,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  password: string;
  error: string;
  deleting: boolean;
  onPasswordChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={s.modalBackdrop}>
        <View accessibilityRole="alert" style={[s.modalCard, s.storyErrorCard]}>
          <View
            style={[
              s.modalIcon,
              { borderColor: C.red, backgroundColor: "#281716" },
            ]}
          >
            <Ionicons name="warning-outline" size={30} color="#F19A92" />
          </View>
          <Text style={s.modalTitle}>Permanently delete your account?</Text>
          <Text style={s.modalBody}>
            Your account, campaigns, characters, private worlds, story history,
            and remaining Crowns will be deleted from every device. This cannot
            be undone.
          </Text>
          <View style={[s.authInputWrap, { width: "100%" }]}>
            <Ionicons name="lock-closed-outline" size={18} color={C.muted} />
            <TextInput
              value={password}
              onChangeText={onPasswordChange}
              placeholder="Enter your current password"
              placeholderTextColor="#666"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              style={s.authInput}
              accessibilityLabel="Current password"
              onSubmitEditing={onConfirm}
            />
          </View>
          {error ? (
            <View style={s.authErrorRow}>
              <Ionicons name="alert-circle-outline" size={16} color="#E28B84" />
              <Text style={s.error}>{error}</Text>
            </View>
          ) : null}
          <View style={s.modalActions}>
            <Button label="Cancel" kind="ghost" onPress={onCancel} />
            <Button
              label={deleting ? "Deleting…" : "Delete my account"}
              kind="danger"
              disabled={deleting || password.length < 8}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StoryErrorDialog({
  error,
  campaignId,
  onClose,
  onBuyCrowns,
}: {
  error: string;
  campaignId: string;
  onClose: () => void;
  onBuyCrowns: () => void;
}) {
  const supportEmail =
    process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "support@stablecrown.com";
  const contactSupport = async () => {
    const subject = encodeURIComponent("Sable Crown story turn failed");
    const body = encodeURIComponent(
      `Hello Sable Crown Support,\n\nA story turn failed and no turn was charged.\n\nCampaign: ${campaignId}\nTime: ${new Date().toISOString()}\nError: ${error}\n\nPlease help me investigate this problem.`,
    );
    try {
      await Linking.openURL(
        `mailto:${supportEmail}?subject=${subject}&body=${body}`,
      );
    } catch {
      Alert.alert(
        "Could not open email",
        `Please contact ${supportEmail} and include campaign ${campaignId}.`,
      );
    }
  };
  const needsCrowns =
    /(?:not|do not|don't) have enough crowns|insufficient crowns|crown balance/i.test(
      error,
    );
  return (
    <Modal
      visible={!!error}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.modalBackdrop}>
        <View accessibilityRole="alert" style={[s.modalCard, s.storyErrorCard]}>
          <View
            style={[
              s.modalIcon,
              {
                borderColor: needsCrowns ? C.gold : C.red,
                backgroundColor: needsCrowns ? "#282116" : "#281716",
              },
            ]}
          >
            <Ionicons
              name={needsCrowns ? "sparkles-outline" : "warning-outline"}
              size={30}
              color={needsCrowns ? C.gold : "#F19A92"}
            />
          </View>
          <Text style={s.modalTitle}>
            {needsCrowns ? "Not enough Crowns" : "The story could not advance"}
          </Text>
          <Text style={s.modalBody}>{error}</Text>
          <View style={s.errorAssurance}>
            <Ionicons
              name="shield-checkmark-outline"
              size={17}
              color={C.green}
            />
            <Text style={s.errorAssuranceText}>
              Your campaign is safe and no story turn was charged.
            </Text>
          </View>
          <View style={s.modalActions}>
            <Button label="Close" kind="ghost" onPress={onClose} />
            {needsCrowns ? (
              <Button
                label="Buy Crowns"
                icon="sparkles-outline"
                onPress={() => {
                  onClose();
                  onBuyCrowns();
                }}
              />
            ) : (
              <Button
                label="Contact support"
                icon="mail-outline"
                onPress={contactSupport}
              />
            )}
          </View>
          <Text style={s.errorReference}>
            REFERENCE · {campaignId.slice(0, 8).toUpperCase()}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function CampaignCreateErrorDialog({
  error,
  onClose,
}: {
  error: string;
  onClose: () => void;
}) {
  const supportEmail =
    process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "support@stablecrown.com";
  const contactSupport = async () => {
    const subject = encodeURIComponent("Sable Crown campaign creation failed");
    const body = encodeURIComponent(
      `Hello Sable Crown Support,\n\nMy campaign could not be created.\n\nTime: ${new Date().toISOString()}\nError: ${error}\n\nPlease help me investigate this problem.`,
    );
    try {
      await Linking.openURL(
        `mailto:${supportEmail}?subject=${subject}&body=${body}`,
      );
    } catch {
      Alert.alert("Could not open email", `Please contact ${supportEmail}.`);
    }
  };
  return (
    <Modal
      visible={!!error}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.modalBackdrop}>
        <View accessibilityRole="alert" style={[s.modalCard, s.storyErrorCard]}>
          <View
            style={[
              s.modalIcon,
              { borderColor: C.red, backgroundColor: "#281716" },
            ]}
          >
            <Ionicons name="warning-outline" size={30} color="#F19A92" />
          </View>
          <Text style={s.modalTitle}>Campaign could not be created</Text>
          <Text style={s.modalBody}>{error}</Text>
          <View style={s.errorAssurance}>
            <Ionicons
              name="shield-checkmark-outline"
              size={17}
              color={C.green}
            />
            <Text style={s.errorAssuranceText}>
              No campaign was saved and no Crowns were charged.
            </Text>
          </View>
          <View style={s.modalActions}>
            <Button label="Close" kind="ghost" onPress={onClose} />
            <Button
              label="Contact support"
              icon="mail-outline"
              onPress={contactSupport}
            />
          </View>
          <Text style={s.errorReference}>{supportEmail.toUpperCase()}</Text>
        </View>
      </View>
    </Modal>
  );
}

function CampaignCostApprovalDialog({
  required,
  approved,
  busy,
  onCancel,
  onApprove,
}: {
  required: number;
  approved: number;
  busy: boolean;
  onCancel: () => void;
  onApprove: () => void;
}) {
  return (
    <Modal
      visible={required > 0}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={s.modalBackdrop}>
        <View accessibilityRole="alert" style={s.modalCard}>
          <View style={s.modalIcon}>
            <Ionicons name="sparkles-outline" size={28} color={C.gold} />
          </View>
          <Text style={s.modalTitle}>Approve the revised estimate?</Text>
          <Text style={s.modalBody}>
            The completed financial analysis requires {required} Crowns instead
            of the previously approved maximum of {approved}. No campaign has
            been saved and no Crowns have been charged.
          </Text>
          <View style={s.importInfoBar}>
            <Ionicons
              name="information-circle-outline"
              size={22}
              color={C.gold}
            />
            <Text style={s.importInfoText}>
              The higher cost reflects the measured AI usage needed to estimate
              the player treasury and faction finances.
            </Text>
          </View>
          <View style={s.modalActions}>
            <Button
              label="Cancel"
              kind="ghost"
              disabled={busy}
              onPress={onCancel}
            />
            <Button
              label={busy ? "Creating…" : `Approve ${required} Crowns`}
              disabled={busy}
              onPress={onApprove}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function NarrationErrorDialog({
  error,
  onClose,
}: {
  error: string;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={!!error}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.modalBackdrop}>
        <View accessibilityRole="alert" style={[s.modalCard, s.storyErrorCard]}>
          <View
            style={[
              s.modalIcon,
              { borderColor: C.red, backgroundColor: "#281716" },
            ]}
          >
            <Ionicons name="volume-mute-outline" size={30} color="#F19A92" />
          </View>
          <Text style={s.modalTitle}>Narration could not be generated</Text>
          <Text style={s.modalBody}>{error}</Text>
          <View style={s.errorAssurance}>
            <Ionicons
              name="shield-checkmark-outline"
              size={17}
              color={C.green}
            />
            <Text style={s.errorAssuranceText}>
              Any reserved Crowns have been refunded. Your story has not
              changed.
            </Text>
          </View>
          <View style={s.modalActions}>
            <Button label="Close" kind="ghost" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function WorldDeleteErrorDialog({
  error,
  onClose,
}: {
  error: string;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={!!error}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.modalBackdrop}>
        <View accessibilityRole="alert" style={[s.modalCard, s.storyErrorCard]}>
          <View
            style={[
              s.modalIcon,
              { borderColor: C.red, backgroundColor: "#281716" },
            ]}
          >
            <Ionicons name="warning-outline" size={30} color="#F19A92" />
          </View>
          <Text style={s.modalTitle}>World cannot be deleted</Text>
          <Text style={s.modalBody}>{error}</Text>
          <View style={s.errorAssurance}>
            <Ionicons
              name="shield-checkmark-outline"
              size={17}
              color={C.green}
            />
            <Text style={s.errorAssuranceText}>
              The world and its campaigns have not been changed.
            </Text>
          </View>
          <View style={s.modalActions}>
            <Button label="Close" kind="ghost" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Tag({ children }: { children: string }) {
  return (
    <View style={s.tag}>
      <Text style={s.tagText}>{children}</Text>
    </View>
  );
}
function SectionTitle({
  eyebrow,
  title,
  copy,
}: {
  eyebrow?: string;
  title: string;
  copy?: string;
}) {
  return (
    <View style={{ gap: 5 }}>
      {eyebrow && <Text style={s.eyebrow}>{eyebrow}</Text>}
      <Text style={s.h2}>{title}</Text>
      {copy && <Text style={s.copy}>{copy}</Text>}
    </View>
  );
}

function Auth({
  onEnter,
}: {
  onEnter: (
    username: string,
    password: string,
    action: "signin" | "signup",
    email?: string,
  ) => Promise<void>;
}) {
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recoveryAction, setRecoveryAction] = useState<
    "username" | "password" | null
  >(null);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const usernameValid = /^[a-zA-Z0-9_-]{3,24}$/.test(username);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordValid = password.length >= 8;
  const valid =
    usernameValid &&
    passwordValid &&
    (mode === "signin" || (emailValid && password === confirm));
  const submit = async () => {
    if (!usernameValid)
      return setAuthError(
        "Use 3–24 letters, numbers, underscores, or hyphens.",
      );
    if (mode === "create" && !emailValid)
      return setAuthError("Enter a valid email address.");
    if (!passwordValid)
      return setAuthError("Password must contain at least 8 characters.");
    if (mode === "create" && password !== confirm)
      return setAuthError("Those passwords do not match.");
    setAuthError("");
    setSubmitting(true);
    try {
      await onEnter(
        username.trim(),
        password,
        mode === "create" ? "signup" : "signin",
        mode === "create" ? email.trim() : undefined,
      );
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Could not sign in.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const recover = async () => {
    if (
      !recoveryAction ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail.trim())
    ) {
      setRecoverySent(false);
      return setRecoveryMessage("Enter a valid email address.");
    }
    setRecovering(true);
    setRecoveryMessage("");
    setRecoverySent(false);
    try {
      await requestAccountRecovery(recoveryEmail.trim(), recoveryAction);
      setRecoveryMessage(
        "If that email belongs to an account, recovery instructions have been sent.",
      );
      setRecoverySent(true);
    } catch (error) {
      setRecoveryMessage(
        error instanceof Error
          ? error.message
          : "Recovery could not be requested.",
      );
    } finally {
      setRecovering(false);
    }
  };
  return (
    <LinearGradient colors={[C.ink, "#161B1B", "#251E18"]} style={{ flex: 1 }}>
      <SafeAreaView style={s.authWrap}>
        <View style={s.brandMark}>
          <Text style={s.brandRune}>S</Text>
        </View>
        <Text style={s.logo}>SABLE CROWN</Text>
        <Text style={s.authTitle}>
          {mode === "signin" ? "Return to your story." : "Claim your name."}
        </Text>
        <Text style={s.authCopy}>
          {mode === "signin"
            ? "Your worlds remember every oath, every wound, and every unfinished thread."
            : "Create one account for your private worlds and persistent campaigns."}
        </Text>
        <View style={s.authCard}>
          <View style={s.authTabs}>
            <Pressable
              onPress={() => {
                setMode("signin");
                setAuthError("");
              }}
              style={[s.authTab, mode === "signin" && s.authTabActive]}
            >
              <Text
                style={[
                  s.authTabText,
                  mode === "signin" && s.authTabTextActive,
                ]}
              >
                SIGN IN
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMode("create");
                setAuthError("");
              }}
              style={[s.authTab, mode === "create" && s.authTabActive]}
            >
              <Text
                style={[
                  s.authTabText,
                  mode === "create" && s.authTabTextActive,
                ]}
              >
                CREATE ACCOUNT
              </Text>
            </Pressable>
          </View>
          <View style={s.authLabelRow}>
            <Text style={s.label}>USERNAME</Text>
            {mode === "signin" && (
              <Pressable
                onPress={() => {
                  setRecoveryAction("username");
                  setRecoveryMessage("");
                  setRecoverySent(false);
                }}
              >
                <Text style={s.authLink}>Forgot username?</Text>
              </Pressable>
            )}
          </View>
          <View style={s.authInputWrap}>
            <Ionicons name="person-outline" size={18} color={C.muted} />
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="mara_venn"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
              style={s.authInput}
              accessibilityLabel="Username"
            />
          </View>
          {mode === "create" && (
            <>
              <Text style={s.label}>EMAIL</Text>
              <View style={s.authInputWrap}>
                <Ionicons name="mail-outline" size={18} color={C.muted} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#666"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  style={s.authInput}
                  accessibilityLabel="Email address"
                />
              </View>
            </>
          )}
          <View style={s.authLabelRow}>
            <Text style={s.label}>PASSWORD</Text>
            {mode === "signin" && (
              <Pressable
                onPress={() => {
                  setRecoveryAction("password");
                  setRecoveryMessage("");
                  setRecoverySent(false);
                }}
              >
                <Text style={s.authLink}>Forgot password?</Text>
              </Pressable>
            )}
          </View>
          <View style={s.authInputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={C.muted} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor="#666"
              secureTextEntry={Platform.OS !== "web" && !showPassword}
              autoComplete="off"
              autoCapitalize="none"
              style={[
                s.authInput,
                Platform.OS === "web" && !showPassword && s.webPasswordMasked,
              ]}
              accessibilityLabel="Password"
              onSubmitEditing={submit}
            />
            <Pressable
              accessibilityLabel={
                showPassword ? "Hide password" : "Show password"
              }
              onPress={() => setShowPassword((v) => !v)}
              style={s.passwordToggle}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={19}
                color={C.white}
              />
            </Pressable>
          </View>
          {mode === "create" && (
            <>
              <Text style={s.label}>CONFIRM PASSWORD</Text>
              <View
                style={[
                  s.authInputWrap,
                  confirm.length > 0 &&
                    password !== confirm &&
                    s.authInputInvalid,
                ]}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color={
                    confirm.length > 0 && password !== confirm
                      ? "#E28B84"
                      : C.muted
                  }
                />
                <TextInput
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Repeat your password"
                  placeholderTextColor="#666"
                  secureTextEntry={Platform.OS !== "web" && !showPassword}
                  autoComplete="off"
                  autoCapitalize="none"
                  style={[
                    s.authInput,
                    Platform.OS === "web" &&
                      !showPassword &&
                      s.webPasswordMasked,
                  ]}
                  accessibilityLabel="Confirm password"
                  onSubmitEditing={submit}
                />
                <Pressable
                  accessibilityLabel={
                    showPassword ? "Hide password" : "Show password"
                  }
                  onPress={() => setShowPassword((v) => !v)}
                  style={s.passwordToggle}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={19}
                    color={C.white}
                  />
                </Pressable>
              </View>
              {confirm.length > 0 && password !== confirm && (
                <View style={s.fieldError}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={14}
                    color="#E28B84"
                  />
                  <Text style={s.fieldErrorText}>Passwords do not match.</Text>
                </View>
              )}
            </>
          )}
          {authError ? (
            <View style={s.authErrorRow}>
              <Ionicons name="alert-circle-outline" size={16} color="#E28B84" />
              <Text style={s.error}>{authError}</Text>
            </View>
          ) : null}
          <Button
            label={
              submitting
                ? "Opening the chronicle…"
                : mode === "signin"
                  ? "Enter the realm"
                  : "Create my account"
            }
            icon="arrow-forward"
            disabled={!valid || submitting}
            onPress={submit}
          />
          <View style={s.authDivider}>
            <View style={s.authDividerLine} />
            <Text style={s.authDividerText}>PRIVATE BY DEFAULT</Text>
            <View style={s.authDividerLine} />
          </View>
          <Text style={s.fine}>
            By continuing, you confirm you are 18+ and accept the mature-content
            boundary.{" "}
            {isSupabaseConfigured
              ? "Your account is securely synchronized across devices."
              : "Authentication is device-local until Supabase is configured."}
          </Text>
        </View>
      </SafeAreaView>
      <Modal
        visible={!!recoveryAction}
        transparent
        animationType="fade"
        onRequestClose={() => setRecoveryAction(null)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            {recoverySent ? (
              <>
                <View style={[s.modalIcon, s.recoverySuccessIcon]}>
                  <Ionicons name="checkmark" size={32} color={C.green} />
                </View>
                <Text style={s.modalTitle}>Check your email</Text>
                <View style={s.recoverySuccess}>
                  <Ionicons name="checkmark-circle" size={20} color={C.green} />
                  <Text style={s.recoverySuccessText}>
                    If that email belongs to an account, recovery instructions
                    have been sent.
                  </Text>
                </View>
                <View style={s.modalActions}>
                  <Button
                    label="Done"
                    onPress={() => {
                      setRecoveryAction(null);
                      setRecoveryMessage("");
                      setRecoverySent(false);
                      setRecoveryEmail("");
                    }}
                  />
                </View>
              </>
            ) : (
              <>
                <View style={s.modalIcon}>
                  <Ionicons
                    name={
                      recoveryAction === "username"
                        ? "person-outline"
                        : "key-outline"
                    }
                    size={28}
                    color={C.gold}
                  />
                </View>
                <Text style={s.modalTitle}>
                  {recoveryAction === "username"
                    ? "Recover username"
                    : "Reset password"}
                </Text>
                <Text style={s.modalBody}>
                  {recoveryAction === "username"
                    ? "Enter the email used to create your account. We will send your username."
                    : "Enter the email used to create your account. We will send a secure password-reset link."}
                </Text>
                <View style={[s.authInputWrap, { width: "100%" }]}>
                  <Ionicons name="mail-outline" size={18} color={C.muted} />
                  <TextInput
                    value={recoveryEmail}
                    onChangeText={setRecoveryEmail}
                    placeholder="you@example.com"
                    placeholderTextColor="#666"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={s.authInput}
                  />
                </View>
                {recoveryMessage ? (
                  <Text style={s.error}>{recoveryMessage}</Text>
                ) : null}
                <View style={s.modalActions}>
                  <Button
                    label="Cancel"
                    kind="ghost"
                    onPress={() => {
                      setRecoveryAction(null);
                      setRecoveryMessage("");
                      setRecoverySent(false);
                    }}
                  />
                  <Button
                    label={recovering ? "Sending…" : "Send recovery email"}
                    disabled={recovering}
                    onPress={recover}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

function ResetPassword({
  onComplete,
  onCancel,
}: {
  onComplete: () => Promise<void>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (password.length < 8)
      return setError("Password must contain at least 8 characters.");
    if (password !== confirm) return setError("Those passwords do not match.");
    setSaving(true);
    setError("");
    try {
      await updateRecoveredPassword(password);
      await onComplete();
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Password could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  };
  const passwordField = (
    label: string,
    value: string,
    onChangeText: (next: string) => void,
    placeholder: string,
  ) => (
    <>
      <Text style={s.label}>{label}</Text>
      <View style={s.authInputWrap}>
        <Ionicons name="lock-closed-outline" size={18} color={C.muted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#666"
          secureTextEntry={Platform.OS !== "web" && !showPassword}
          autoComplete="off"
          autoCapitalize="none"
          style={[
            s.authInput,
            Platform.OS === "web" && !showPassword && s.webPasswordMasked,
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showPassword ? "Hide password" : "Show password"}
          onPress={() => setShowPassword((current) => !current)}
          style={s.passwordToggle}
        >
          <Ionicons
            name={showPassword ? "eye-off-outline" : "eye-outline"}
            size={19}
            color={C.white}
          />
        </Pressable>
      </View>
    </>
  );
  return (
    <LinearGradient colors={[C.ink, "#161B1B", "#251E18"]} style={{ flex: 1 }}>
      <SafeAreaView style={s.authWrap}>
        <View style={s.brandMark}>
          <Text style={s.brandRune}>S</Text>
        </View>
        <Text style={s.logo}>SABLE CROWN</Text>
        <Text style={s.authTitle}>Choose a new password.</Text>
        <View style={s.authCard}>
          {passwordField(
            "NEW PASSWORD",
            password,
            setPassword,
            "At least 8 characters",
          )}
          {passwordField(
            "CONFIRM PASSWORD",
            confirm,
            setConfirm,
            "Repeat your password",
          )}
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Button
            label={saving ? "Saving…" : "Set new password"}
            disabled={saving}
            onPress={submit}
          />
          <Button
            label="Cancel password recovery"
            kind="ghost"
            disabled={saving}
            onPress={onCancel}
          />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

function Nav({
  screen,
  setScreen,
}: {
  screen: Screen;
  setScreen: (v: Screen) => void;
}) {
  const tabs: [Screen, string, keyof typeof Ionicons.glyphMap][] = [
    ["home", "Stories", "book-outline"],
    ["packs", "Worlds", "globe-outline"],
    ["settings", "Settings", "settings-outline"],
  ];
  return (
    <View style={s.nav}>
      {tabs.map(([id, label, icon]) => (
        <Pressable key={id} onPress={() => setScreen(id)} style={s.navItem}>
          <Ionicons
            name={icon}
            size={21}
            color={screen === id ? C.gold : C.muted}
          />
          <Text style={[s.navText, screen === id && { color: C.gold }]}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Home({
  data,
  openCampaign,
  deleteCampaign,
  openWorlds,
  openStore,
}: {
  data: AppData;
  openCampaign: (c: Campaign) => void;
  deleteCampaign: (c: Campaign) => Promise<void>;
  openWorlds: () => void;
  openStore: () => void;
}) {
  const active = data.campaigns.filter((c) => !c.archived);
  const [pendingDelete, setPendingDelete] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState(false);
  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteCampaign(pendingDelete);
      setPendingDelete(null);
    } catch (error) {
      Alert.alert(
        "Campaign could not be deleted",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setDeleting(false);
    }
  };
  return (
    <>
      <ScrollView
        contentContainerStyle={[
          s.page,
          active.length === 0 && s.emptyStoriesPage,
        ]}
      >
        <View style={s.topline}>
          <View>
            <Text style={s.eyebrow}>WELCOME BACK</Text>
            <Text style={s.h1}>{data.user?.name}</Text>
          </View>
          <View style={s.balanceActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${data.user?.creditsRemaining || 0} Crowns available. Buy more Crowns.`}
              onPress={openStore}
              style={({ pressed }) => [s.quota, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="sparkles" size={14} color={C.gold} />
              <Text style={s.quotaText}>
                {data.user?.creditsRemaining} Crowns
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Buy more Crowns"
              onPress={openStore}
              style={({ pressed }) => [s.buyTurns, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="add" size={16} color={C.ink} />
              <Text style={s.buyTurnsText}>Buy Crowns</Text>
            </Pressable>
          </View>
        </View>
        {active.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionTitle title="Continue your story" />
            {active.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => openCampaign(c)}
                style={s.campaignCard}
              >
                <LinearGradient
                  colors={["#2B251D", "#15191A"]}
                  style={s.campaignGlow}
                >
                  <View style={s.campaignMeta}>
                    <Tag>
                      {data.packs.find(
                        (pack) =>
                          pack.id === c.packId &&
                          pack.version === c.packVersion,
                      )?.metadata.title || "PRIVATE WORLD"}
                    </Tag>
                    <View style={s.campaignCardActions}>
                      <Text style={s.muted}>
                        {new Date(c.updatedAt).toLocaleDateString()}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${c.title}`}
                        hitSlop={8}
                        onPress={(event) => {
                          event.stopPropagation();
                          setPendingDelete(c);
                        }}
                        style={s.deleteCampaignButton}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={17}
                          color="#E28B84"
                        />
                      </Pressable>
                    </View>
                  </View>
                  <Text style={s.cardTitle}>{c.title}</Text>
                  <Text style={s.copy} numberOfLines={2}>
                    {c.state.summary ||
                      "The succession bell has sounded. A dying courier carries a secret."}
                  </Text>
                  <View style={s.row}>
                    <Text style={s.goldText}>
                      Continue as {c.character.name}
                    </Text>
                    <Ionicons name="arrow-forward" size={18} color={C.gold} />
                  </View>
                </LinearGradient>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={s.emptyStoriesStage}>
            <View style={s.emptyStories}>
              <View style={s.emptyStoriesIcon}>
                <Ionicons name="book-outline" size={34} color={C.gold} />
              </View>
              <Text style={s.h2}>No active campaigns</Text>
              <Text style={[s.copy, { textAlign: "center" }]}>
                Choose a world to begin a new story. Your campaigns will appear
                here once they have started.
              </Text>
              <Button
                label="Browse worlds"
                icon="globe-outline"
                onPress={openWorlds}
              />
            </View>
          </View>
        )}
      </ScrollView>
      <ConfirmDialog
        visible={!!pendingDelete}
        title="Delete this campaign?"
        body={
          pendingDelete
            ? `“${pendingDelete.title}” and its complete story history, character, world state, memories, and intelligence will be permanently deleted. This cannot be undone.`
            : ""
        }
        confirmLabel={deleting ? "Deleting…" : "Delete campaign"}
        danger
        onCancel={() => !deleting && setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function Store({
  balance,
  onBack,
  onPurchase,
}: {
  balance: number;
  onBack: () => void;
  onPurchase: (credits: number) => void;
}) {
  const packs = [
    { credits: 25, price: "£1.99", note: "A short chapter" },
    { credits: 100, price: "£5.99", note: "Most popular", featured: true },
    { credits: 300, price: "£14.99", note: "Best value" },
  ];
  const [selected, setSelected] = useState<(typeof packs)[number] | null>(null);
  return (
    <>
      <ScrollView contentContainerStyle={s.page}>
        <Pressable onPress={onBack} style={s.back}>
          <Ionicons name="arrow-back" size={18} color={C.muted} />
          <Text style={s.muted}>Stories</Text>
        </Pressable>
        <View style={s.storeHeading}>
          <View>
            <Text style={s.eyebrow}>APP CURRENCY</Text>
            <Text style={s.h1}>Buy Crowns</Text>
          </View>
          <View style={s.quota}>
            <Ionicons name="sparkles" size={14} color={C.gold} />
            <Text style={s.quotaText}>{balance} Crowns available</Text>
          </View>
        </View>
        <Text style={s.copy}>
          Crowns pay for successful story advances, AI narration, and world
          preparation. Failed, blocked, or interrupted requests cost nothing.
        </Text>
        <View style={s.storeGrid}>
          {packs.map((pack) => (
            <Pressable
              key={pack.credits}
              onPress={() => setSelected(pack)}
              style={({ pressed }) => [
                s.turnPack,
                pack.featured && s.turnPackFeatured,
                pressed && { opacity: 0.75 },
              ]}
            >
              {pack.featured && <Text style={s.packRibbon}>MOST POPULAR</Text>}
              <Ionicons name="sparkles" size={24} color={C.gold} />
              <Text style={s.turnCount}>{pack.credits}</Text>
              <Text style={s.turnLabel}>CROWNS</Text>
              <Text style={s.packPrice}>{pack.price}</Text>
              <Text style={s.muted}>{pack.note}</Text>
              <View
                style={[
                  s.packBuy,
                  pack.featured && { backgroundColor: C.gold },
                ]}
              >
                <Text
                  style={[s.packBuyText, pack.featured && { color: C.ink }]}
                >
                  Choose pack
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
        <View style={s.notice}>
          <Ionicons
            name="information-circle-outline"
            size={22}
            color={C.gold}
          />
          <View style={{ flex: 1 }}>
            <Text style={s.noticeTitle}>Prototype checkout</Text>
            <Text style={s.copy}>
              Selecting a pack currently adds demonstration Crowns without
              charging you. Production purchases will use the appropriate web or
              mobile store checkout.
            </Text>
          </View>
        </View>
      </ScrollView>
      <ConfirmDialog
        visible={!!selected}
        title="Confirm Crown pack"
        body={
          selected
            ? `${selected.credits} Crowns · ${selected.price}\n\nThis prototype will not charge you.`
            : ""
        }
        confirmLabel="Confirm purchase"
        onCancel={() => setSelected(null)}
        onConfirm={() => {
          if (selected) onPurchase(selected.credits);
          setSelected(null);
        }}
      />
    </>
  );
}

function OptionPicker({
  label,
  entries,
  value,
  onChange,
}: {
  label: string;
  entries: NamedEntry[];
  value?: NamedEntry;
  onChange: (v: NamedEntry) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.optionGrid}>
        {entries.map((e) => (
          <Pressable
            key={e.id}
            onPress={() => onChange(e)}
            style={[s.option, value?.id === e.id && s.optionActive]}
          >
            <Text
              style={[s.optionName, value?.id === e.id && { color: C.gold }]}
            >
              {e.name}
            </Text>
            <Text style={s.optionCopy}>{e.description}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const wealthLabels: Record<FactionWealthTier, string> = {
  "very-rich": "Very Rich",
  rich: "Rich",
  average: "Average",
  poor: "Poor",
  destitute: "Destitute",
};
const wealthTiers = Object.keys(wealthLabels) as FactionWealthTier[];
const wealthTierNumbers: Record<
  FactionWealthTier,
  { balance: number; income: number }
> = {
  "very-rich": { balance: 10000000, income: 1000000 },
  rich: { balance: 8000000, income: 800000 },
  average: { balance: 6000000, income: 600000 },
  poor: { balance: 4000000, income: 400000 },
  destitute: { balance: 2000000, income: 200000 },
};

function TreasuryTierEditor({
  pack,
  currency,
  onCurrencyChange,
  playerTier,
  onPlayerTierChange,
  factionWealth,
  onFactionChange,
}: {
  pack: WorldPack;
  currency: string;
  onCurrencyChange: (value: string) => void;
  playerTier: FactionWealthTier;
  onPlayerTierChange: (value: FactionWealthTier) => void;
  factionWealth: Record<string, FactionWealthTier>;
  onFactionChange: (id: string, value: FactionWealthTier) => void;
}) {
  const pageSize = 5;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(pack.factions.length / pageSize));
  const shown = pack.factions.slice((page - 1) * pageSize, page * pageSize);
  const tierButtons = (
    value: FactionWealthTier,
    select: (tier: FactionWealthTier) => void,
  ) => (
    <View style={s.pillRow}>
      {wealthTiers.map((tier) => (
        <Pressable
          key={tier}
          onPress={() => select(tier)}
          style={[s.pill, value === tier && s.pillActive]}
        >
          <Text style={[s.pillText, value === tier && { color: C.ink }]}>
            {wealthLabels[tier]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <View style={{ gap: 18, minWidth: 0 }}>
      <View style={{ gap: 6 }}>
        <Text style={s.label}>CURRENCY</Text>
        <TextInput
          value={currency}
          onChangeText={onCurrencyChange}
          placeholder="Gold dragons"
          placeholderTextColor="#687074"
          style={s.input}
        />
        <Text style={s.fineLeft}>
          Choose how money is named. Exact balances remain hidden during setup.
        </Text>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={s.label}>YOUR STARTING WEALTH</Text>
        {tierButtons(playerTier, onPlayerTierChange)}
      </View>
      {pack.factions.length ? (
        <View style={{ gap: 12 }}>
          <View>
            <Text style={s.label}>FACTION WEALTH</Text>
            <Text style={s.fineLeft}>
              Set broad financial strength. Figures are calculated internally on
              a fixed monthly scale.
            </Text>
          </View>
          {shown.map((faction) => (
            <View
              key={faction.id}
              style={{
                gap: 7,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: C.line,
              }}
            >
              <Text style={s.optionName}>{faction.name}</Text>
              {tierButtons(factionWealth[faction.id] || "average", (tier) =>
                onFactionChange(faction.id, tier),
              )}
            </View>
          ))}
          {pageCount > 1 && (
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <Button
                label="Previous"
                disabled={page === 1}
                onPress={() => setPage((value) => Math.max(1, value - 1))}
              />
              <Text style={s.copy}>{`Page ${page} of ${pageCount}`}</Text>
              <Button
                label="Next"
                disabled={page === pageCount}
                onPress={() =>
                  setPage((value) => Math.min(pageCount, value + 1))
                }
              />
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function CharacterCreate({
  pack,
  onBack,
  onCreate,
}: {
  pack: WorldPack;
  onBack: () => void;
  onCreate: (
    c: Character,
    campaignName: string,
    setup: CampaignSetupOptions,
  ) => void;
}) {
  const o = pack.characterOptions;
  const preset = pack.openingScenario?.playerPreset;
  const find = (entries: NamedEntry[], id?: string) =>
    entries.find((entry) => entry.id === id);
  const [campaignName, setCampaignName] = useState("");
  const [name, setName] = useState(preset?.name || "");
  const [pronouns, setPronouns] = useState(preset?.pronouns || "he/him");
  const [background, setBackground] = useState<NamedEntry | undefined>(() =>
    find(o.backgrounds, preset?.backgroundId),
  );
  const [strength, setStrength] = useState<NamedEntry | undefined>(() =>
    find(o.strengths, preset?.strengthId),
  );
  const [weakness, setWeakness] = useState<NamedEntry | undefined>(() =>
    find(o.weaknesses, preset?.weaknessId),
  );
  const [motivation, setMotivation] = useState<NamedEntry | undefined>(() =>
    find(
      o.motivationsByBackground?.[preset?.backgroundId || ""] || o.motivations,
      preset?.motivationId,
    ),
  );
  const [motivationMode, setMotivationMode] = useState<
    "guided" | "custom" | "discover"
  >("guided");
  const [customMotivation, setCustomMotivation] = useState("");
  const [setupTab, setSetupTab] = useState<"character" | "settings">(
    "character",
  );
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [treasuryEnabled, setTreasuryEnabled] = useState(false);
  const [treasurySource, setTreasurySource] = useState<
    "pack" | "manual" | "ai"
  >("ai");
  const [manualTreasury, setManualTreasury] = useState({
    name: "",
    currency: "gold",
    balance: "0",
    recurringIncome: "0",
    recurringOutgoings: "200000",
    incomePeriod: "month",
  });
  const [playerWealth, setPlayerWealth] =
    useState<FactionWealthTier>("average");
  const [factionWealth, setFactionWealth] = useState<
    Record<string, FactionWealthTier>
  >(() =>
    Object.fromEntries(pack.factions.map((faction) => [faction.id, "average"])),
  );
  const [setupQuote, setSetupQuote] =
    useState<CampaignSetupOptions["treasury"]["quote"]>();
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);
  const motivations = background
    ? o.motivationsByBackground?.[background.id] || o.motivations
    : [];
  const selectedMotivation =
    motivationMode === "custom"
      ? {
          id: "custom-motivation",
          name: customMotivation.trim(),
          description: "A personal ambition written by the player.",
        }
      : motivationMode === "discover"
        ? {
            id: "story-decides",
            name: "Let the Story Decide",
            description:
              "Begin without a declared ambition and discover it through play.",
          }
        : motivation;
  const character =
    background && strength && weakness && selectedMotivation
      ? ({
          name: name.trim(),
          pronouns,
          background,
          strength,
          weakness,
          motivation: selectedMotivation,
        } as Character)
      : null;
  const packTreasury = background
    ? (pack as any).economicProfiles?.find((profile: any) =>
        profile.backgroundIds?.includes(background.id),
      )
    : null;
  useEffect(() => {
    if (packTreasury) setTreasurySource("pack");
  }, [background?.id]);
  const selectedWealth = wealthTierNumbers[playerWealth];
  const setup: CampaignSetupOptions = {
    treasury: {
      enabled: false,
      source:
        packTreasury && treasurySource === "pack" ? "pack" : treasurySource,
      factionWealth,
      ...(treasurySource === "manual"
        ? {
            manual: {
              name: `${name.trim() || "Player"} Treasury`,
              currency: manualTreasury.currency.trim() || "gold",
              balance: selectedWealth.balance,
              recurringIncome: selectedWealth.income,
              recurringOutgoings: 200000,
              incomePeriod: "month",
            },
          }
        : {}),
      ...(treasurySource === "ai" && setupQuote ? { quote: setupQuote } : {}),
    },
  };
  const characterValidationErrors = () => {
    const missing: string[] = [];
    if (campaignName.trim().length < 3)
      missing.push("Enter a campaign name containing at least 3 characters.");
    if (name.trim().length < 2) missing.push("Enter your character’s name.");
    if (!pronouns) missing.push("Choose the character’s pronouns.");
    if (!background) missing.push("Choose a background.");
    if (!strength) missing.push("Choose a strength.");
    if (!weakness) missing.push("Choose a weakness.");
    if (motivationMode === "guided" && !motivation)
      missing.push(
        "Choose an ambition, or select “Write my own” or “Let the story decide.”",
      );
    if (motivationMode === "custom" && customMotivation.trim().length < 5)
      missing.push("Write a custom ambition containing at least 5 characters.");
    return missing;
  };
  const settingsValidationErrors = () => {
    return [];
  };
  const reviewSettings = () => {
    const missing = characterValidationErrors();
    if (missing.length) setValidationErrors(missing);
    else setSetupTab("settings");
  };
  const createCampaign = () => {
    const missing = [
      ...characterValidationErrors(),
      ...settingsValidationErrors(),
    ];
    if (missing.length || !character)
      return setValidationErrors(
        missing.length ? missing : ["Complete the required character details."],
      );
    onCreate(
      Object.assign(character, { campaignSetup: setup }),
      campaignName.trim(),
      setup,
    );
  };
  const getQuote = async () => {
    if (!character)
      return setQuoteError(
        "Complete the character details before requesting an estimate.",
      );
    setQuoting(true);
    setQuoteError("");
    try {
      const quote = await quoteCampaignSetup(pack, character, {
        treasury: { enabled: true, source: "ai" },
      });
      setSetupQuote({
        expectedCost: quote.expectedCost,
        maximumCost: quote.maximumCost,
        estimatedTokens: quote.estimatedTokens,
        preparationId: quote.preparationId,
      });
    } catch (error) {
      setQuoteError(
        error instanceof Error
          ? error.message
          : "The estimate could not be quoted.",
      );
    } finally {
      setQuoting(false);
    }
  };
  const manualField = (
    _label: string,
    key: keyof typeof manualTreasury,
    _keyboardType?: "numeric",
  ) =>
    key === "name" ? (
      <View style={{ flex: 1 }}>
        <TreasuryTierEditor
          pack={pack}
          currency={manualTreasury.currency}
          onCurrencyChange={(value) =>
            setManualTreasury((current) => ({ ...current, currency: value }))
          }
          playerTier={playerWealth}
          onPlayerTierChange={setPlayerWealth}
          factionWealth={factionWealth}
          onFactionChange={(id, tier) =>
            setFactionWealth((current) => ({ ...current, [id]: tier }))
          }
        />
      </View>
    ) : null;
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Pressable onPress={onBack} style={s.back}>
        <Ionicons name="arrow-back" size={18} color={C.muted} />
        <Text style={s.muted}>Worlds</Text>
      </Pressable>
      <SectionTitle
        eyebrow={pack.metadata.title.toUpperCase()}
        title="Create campaign"
        copy="Choose your character and step into the story."
      />
      {setupTab === "character" ? (
        <>
          <View style={s.formCard}>
            <Text style={s.label}>CAMPAIGN NAME</Text>
            <TextInput
              value={campaignName}
              onChangeText={setCampaignName}
              placeholder="For example: The Just King"
              placeholderTextColor="#687074"
              maxLength={80}
              style={s.input}
            />
            <Text style={s.fineLeft}>
              Give this story a distinct name so you can tell multiple campaigns
              in the same world apart.
            </Text>
            <Text style={s.label}>CHARACTER NAME</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name your character"
              placeholderTextColor="#687074"
              maxLength={80}
              style={s.input}
            />
            <Text style={s.label}>PRONOUNS</Text>
            <View style={s.pillRow}>
              {["he/him", "she/her"].map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setPronouns(p)}
                  style={[s.pill, pronouns === p && s.pillActive]}
                >
                  <Text
                    style={[s.pillText, pronouns === p && { color: C.ink }]}
                  >
                    {p}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <OptionPicker
            label="BACKGROUND"
            entries={o.backgrounds}
            value={background}
            onChange={(value) => {
              setBackground(value);
              setMotivation(undefined);
              setMotivationMode("guided");
              setSetupQuote(undefined);
              setTreasurySource(
                (pack as any).economicProfiles?.some((profile: any) =>
                  profile.backgroundIds?.includes(value.id),
                )
                  ? "pack"
                  : "ai",
              );
            }}
          />
          <OptionPicker
            label="STRENGTH"
            entries={o.strengths}
            value={strength}
            onChange={setStrength}
          />
          <OptionPicker
            label="WEAKNESS"
            entries={o.weaknesses}
            value={weakness}
            onChange={setWeakness}
          />
          {background && (
            <View style={{ gap: 10 }}>
              <Text style={s.label}>MOTIVATION</Text>
              <Text style={s.copy}>
                Choose a direction, write your own ambition, or discover what
                matters through play.
              </Text>
              <View style={s.pillRow}>
                {(
                  [
                    ["guided", "Choose"],
                    ["custom", "Write my own"],
                    ["discover", "Let the story decide"],
                  ] as const
                ).map(([id, label]) => (
                  <Pressable
                    key={id}
                    onPress={() => {
                      setMotivationMode(id);
                      if (id !== "guided") setMotivation(undefined);
                    }}
                    style={[s.pill, motivationMode === id && s.pillActive]}
                  >
                    <Text
                      style={[
                        s.pillText,
                        motivationMode === id && { color: C.ink },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {motivationMode === "guided" && (
                <OptionPicker
                  label={`${background.name.toUpperCase()} AMBITIONS`}
                  entries={motivations}
                  value={motivation}
                  onChange={setMotivation}
                />
              )}
              {motivationMode === "custom" && (
                <TextInput
                  value={customMotivation}
                  onChangeText={setCustomMotivation}
                  placeholder="What does your character want above all else?"
                  placeholderTextColor="#687074"
                  maxLength={160}
                  multiline
                  style={s.input}
                />
              )}
              {motivationMode === "discover" && (
                <View style={s.notice}>
                  <Ionicons name="compass-outline" size={22} color={C.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.noticeTitle}>An unwritten ambition</Text>
                    <Text style={s.copy}>
                      The opening chapters will present possibilities, but only
                      your choices will define what this character truly wants.
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </>
      ) : (
        <View style={s.formCard}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.optionName}>Track treasuries</Text>
              <Text style={s.optionCopy}>
                Optional. Enables balances, income, outgoings, debt pressure,
                and financial consequences.
              </Text>
            </View>
            <Pressable onPress={() => setTreasuryEnabled((value) => !value)}>
              <Ionicons
                name={treasuryEnabled ? "checkbox" : "square-outline"}
                size={26}
                color={C.gold}
              />
            </Pressable>
          </View>
          {treasuryEnabled && (
            <>
              <Text style={s.label}>STARTING INFORMATION</Text>
              <View style={s.pillRow}>
                {packTreasury && (
                  <Pressable
                    onPress={() => {
                      setTreasurySource("pack");
                      setSetupQuote(undefined);
                    }}
                    style={[s.pill, treasurySource === "pack" && s.pillActive]}
                  >
                    <Text
                      style={[
                        s.pillText,
                        treasurySource === "pack" && { color: C.ink },
                      ]}
                    >
                      Use world data · Free
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => {
                    setTreasurySource("manual");
                    setSetupQuote(undefined);
                  }}
                  style={[s.pill, treasurySource === "manual" && s.pillActive]}
                >
                  <Text
                    style={[
                      s.pillText,
                      treasurySource === "manual" && { color: C.ink },
                    ]}
                  >
                    Enter manually · Free
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setTreasurySource("ai");
                    setSetupQuote(undefined);
                  }}
                  style={[s.pill, treasurySource === "ai" && s.pillActive]}
                >
                  <Text
                    style={[
                      s.pillText,
                      treasurySource === "ai" && { color: C.ink },
                    ]}
                  >
                    Estimate with AI
                  </Text>
                </Pressable>
              </View>
              {treasurySource === "manual" && (
                <View style={{ gap: 10 }}>
                  <View style={s.actions}>
                    {manualField("TREASURY NAME", "name")}
                    {manualField("CURRENCY", "currency")}
                  </View>
                  <View style={s.actions}>
                    {manualField("BALANCE", "balance", "numeric")}
                    {manualField("INCOME", "recurringIncome", "numeric")}
                    {manualField("OUTGOINGS", "recurringOutgoings", "numeric")}
                    {manualField("PERIOD", "incomePeriod")}
                  </View>
                </View>
              )}
              {treasurySource === "ai" && (
                <View style={s.importInfoBar}>
                  <Ionicons name="sparkles-outline" size={22} color={C.gold} />
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text style={s.noticeTitle}>AI economic preparation</Text>
                    <Text style={s.importInfoText}>
                      The server will estimate a starting treasury from this
                      world and character. You approve the quote before campaign
                      creation.
                    </Text>
                    {setupQuote ? (
                      <Text
                        style={s.success}
                      >{`Expected ${setupQuote.expectedCost} Crowns · maximum ${setupQuote.maximumCost} Crowns (includes the 20% buffer)`}</Text>
                    ) : (
                      <Button
                        label={quoting ? "Calculating…" : "Get server quote"}
                        disabled={quoting || !character}
                        onPress={getQuote}
                      />
                    )}
                    {quoteError ? (
                      <Text style={s.error}>{quoteError}</Text>
                    ) : null}
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      )}
      <Button
        label="Step into the story"
        icon="arrow-forward"
        onPress={createCampaign}
      />
      <CampaignValidationDialog
        errors={validationErrors}
        onClose={() => setValidationErrors([])}
        onReview={() => {
          const characterMissing = characterValidationErrors();
          setValidationErrors([]);
          setSetupTab("character");
        }}
      />
    </ScrollView>
  );
}

function Play({
  campaign,
  pack,
  crownBalance,
  updateCampaign,
  onExit,
  onOpenIntel,
  onOpenStore,
  onUpdateMetadata,
}: {
  campaign: Campaign;
  pack: WorldPack;
  crownBalance: number;
  updateCampaign: (c: Campaign, charge?: number) => void;
  onExit: () => void;
  onOpenIntel: () => void;
  onOpenStore: () => void;
  onUpdateMetadata: (metadata: { title: string }) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [visibleTurnCount, setVisibleTurnCount] = useState(20);
  const [threadPage, setThreadPage] = useState(1);
  const [turnFeedback, setTurnFeedback] = useState<Record<string, 'helpful' | 'unhelpful'>>({});
  const [feedbackTurnId, setFeedbackTurnId] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [suggestionsTurnId, setSuggestionsTurnId] = useState("");
  const [error, setError] = useState("");
  const [narrationError, setNarrationError] = useState("");
  const [narrationLoadingId, setNarrationLoadingId] = useState("");
  const [editingMetadata, setEditingMetadata] = useState(false);
  const [metadataTitle, setMetadataTitle] = useState(campaign.title);
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [metadataError, setMetadataError] = useState("");
  const [currentAudioId, setCurrentAudioId] = useState("");
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});
  const [cachedNarrations, setCachedNarrations] = useState<Record<string, true>>({});
  const [narrationQuote, setNarrationQuote] = useState<{
    turnId: string;
    cost: number;
    estimatedTokens: number;
  } | null>(null);
  const [skipNarrationConfirm, setSkipNarrationConfirm] = useState(false);
  const [pendingSkipNarrationConfirm, setPendingSkipNarrationConfirm] =
    useState(false);
  const [scrollMetrics, setScrollMetrics] = useState({
    content: 1,
    viewport: 1,
    offset: 0,
  });
  const [inputMetrics, setInputMetrics] = useState({
    content: 1,
    viewport: 1,
    offset: 0,
  });
  const scroll = useRef<ScrollView>(null);
  const speechBaseText = useRef("");
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const { width } = useWindowDimensions();
  const wide = width > 860;
  const threadPageSize = 6;
  const knownThreads = campaign.state.unresolvedThreads || [];
  const threadPageCount = Math.max(
    1,
    Math.ceil(knownThreads.length / threadPageSize),
  );
  const safeThreadPage = Math.min(threadPage, threadPageCount);
  const visibleThreads = knownThreads.slice(
    (safeThreadPage - 1) * threadPageSize,
    safeThreadPage * threadPageSize,
  );
  useEffect(() => {
    setThreadPage(1);
  }, [campaign.id]);
  useEffect(() => {
    if (threadPage > threadPageCount) setThreadPage(threadPageCount);
  }, [threadPage, threadPageCount]);
  useEffect(() => {
    loadNarrationConfirmationPreference().then((value) => {
      setSkipNarrationConfirm(value);
      setPendingSkipNarrationConfirm(value);
    });
  }, []);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    listRemoteNarrationAvailability(campaign.id)
      .then((ids) => {
        if (active)
          setCachedNarrations(Object.fromEntries(ids.map((id) => [id, true])));
      })
      .catch(() => {
        // Availability is advisory; the normal quote still verifies cache state.
      });
    return () => {
      active = false;
    };
  }, [campaign.id]);
  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results?.[0]?.transcript?.trim() || "";
    setText([speechBaseText.current, transcript].filter(Boolean).join(" "));
  });
  useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    if (event.error !== "aborted") {
      setError(
        event.message ||
          "Speech-to-text could not hear that. Please try again.",
      );
    }
  });
  useEffect(() => () => ExpoSpeechRecognitionModule.abort(), []);
  const readScrollOffset = (event: any) =>
    event?.nativeEvent?.contentOffset?.y ??
    event?.currentTarget?.scrollTop ??
    event?.target?.scrollTop ??
    0;
  const trackHeight = Math.max(1, scrollMetrics.viewport - 12);
  const thumbHeight = Math.max(
    42,
    Math.min(
      trackHeight,
      (trackHeight * scrollMetrics.viewport) / scrollMetrics.content,
    ),
  );
  const maxOffset = Math.max(1, scrollMetrics.content - scrollMetrics.viewport);
  const thumbTop =
    6 +
    Math.min(1, scrollMetrics.offset / maxOffset) *
      Math.max(0, trackHeight - thumbHeight);
  const inputTrackHeight = Math.max(1, inputMetrics.viewport - 8);
  const inputThumbHeight = Math.max(
    20,
    Math.min(
      inputTrackHeight,
      (inputTrackHeight * inputMetrics.viewport) / inputMetrics.content,
    ),
  );
  const inputMaxOffset = Math.max(
    1,
    inputMetrics.content - inputMetrics.viewport,
  );
  const inputThumbTop =
    4 +
    Math.min(1, inputMetrics.offset / inputMaxOffset) *
      Math.max(0, inputTrackHeight - inputThumbHeight);
  const send = async (value = text) => {
    if (!value.trim() || sending) return;
    setSuggestionsTurnId("");
    setSending(true);
    setError("");
    const key = uuid();
    try {
      if (isSupabaseConfigured) {
        const result = await submitRemoteTurn(campaign.id, value.trim(), key);
        updateCampaign(
          {
            ...campaign,
            state: applyStateChanges(campaign.state, result.stateChanges),
            turns: result.chapterTransition
              ? [result.turn]
              : [...campaign.turns, result.turn],
            currentChapter:
              result.chapterNumber || campaign.currentChapter || 1,
            chapterTitle: result.chapterTitle || campaign.chapterTitle,
            chapterSummary: result.chapterSummary || campaign.chapterSummary,
            updatedAt: new Date().toISOString(),
          },
          result.usage,
        );
      } else {
        const result = await submitLocalTurn(campaign, pack, value.trim(), key);
        updateCampaign(
          {
            ...campaign,
            state: result.nextState,
            turns: [...campaign.turns, result.turn],
            updatedAt: new Date().toISOString(),
          },
          result.usage,
        );
      }
      setText("");
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The story could not advance. Your turn was not saved.",
      );
    } finally {
      setSending(false);
    }
  };
  const dictate = async () => {
    if (sending) return;
    try {
      if (listening) {
        ExpoSpeechRecognitionModule.stop();
        return;
      }
      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error(
          "Speech-recognition permission was not granted. Enable it in your device settings to use dictation.",
        );
      }
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        throw new Error(
          "Speech recognition is not available on this device or browser.",
        );
      }
      setError("");
      speechBaseText.current = text.trim();
      ExpoSpeechRecognitionModule.start({
        lang:
          typeof navigator !== "undefined" && navigator.language
            ? navigator.language
            : "en-GB",
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        addsPunctuation: true,
        androidIntentOptions: {
          EXTRA_MASK_OFFENSIVE_WORDS: false,
        },
        iosTaskHint: "dictation",
      });
    } catch (value) {
      setListening(false);
      setError(
        value instanceof Error
          ? value.message
          : "Speech recognition could not start.",
      );
    }
  };
  const visibleTurns = campaign.turns.slice(-visibleTurnCount);
  const playNarration = (turnId: string, audioUrl: string) => {
    player.replace(audioUrl);
    setCurrentAudioId(turnId);
    player.play();
  };
  const generateNarration = async (turnId: string) => {
    setNarrationLoadingId(turnId);
    setNarrationError("");
    try {
      const result =
        turnId === "opening"
          ? await generateOpeningNarration(campaign.id)
          : await generateTurnNarration(turnId);
      updateCampaign(campaign, result.cost || 0);
      if (result.downloadUrl)
        setDownloadUrls((urls) => ({ ...urls, [turnId]: result.downloadUrl! }));
      setCachedNarrations((cached) => ({ ...cached, [turnId]: true }));
      playNarration(turnId, result.audioUrl);
      setNarrationQuote(null);
    } catch (value) {
      setNarrationError(
        value instanceof Error
          ? value.message
          : "Narration could not be generated. No Crowns were charged.",
      );
    } finally {
      setNarrationLoadingId("");
    }
  };
  const requestNarration = async (turnId: string) => {
    if (!isSupabaseConfigured)
      return setNarrationError("AI narration requires the connected backend.");
    if (currentAudioId === turnId && playerStatus.playing)
      return player.pause();
    setNarrationLoadingId(turnId);
    setNarrationError("");
    try {
      const quote =
        turnId === "opening"
          ? await quoteOpeningNarration(campaign.id)
          : await quoteTurnNarration(turnId);
      if (quote.cached && quote.audioUrl) {
        setCachedNarrations((cached) => ({ ...cached, [turnId]: true }));
        if (quote.downloadUrl)
          setDownloadUrls((urls) => ({
            ...urls,
            [turnId]: quote.downloadUrl!,
          }));
        playNarration(turnId, quote.audioUrl);
      } else if (skipNarrationConfirm) await generateNarration(turnId);
      else {
        setPendingSkipNarrationConfirm(false);
        setNarrationQuote({
          turnId,
          cost: quote.cost,
          estimatedTokens: quote.estimatedTokens,
        });
      }
    } catch (value) {
      setNarrationError(
        value instanceof Error
          ? value.message
          : "Narration could not be prepared.",
      );
    } finally {
      setNarrationLoadingId("");
    }
  };
  const currentChapter = campaign.currentChapter || 1;
  const chapterHeading =
    campaign.chapterTitle ||
    (currentChapter === 1
      ? pack.openingScenario?.chapterLabel || "CHAPTER I · THE EMPTY THRONE"
      : `CHAPTER ${currentChapter}`);
  const chapterOpening =
    currentChapter === 1
      ? pack.openingScenario?.narration.replaceAll(
          "{name}",
          campaign.character.name,
        ) ||
        openingNarration(
          campaign.character.name,
          campaign.character.background.id,
        )
      : campaign.chapterSummary || campaign.state.summary;
  const narrationCrownEstimate = (narration: string) =>
    Math.max(1, Math.ceil(Math.max(1, Math.ceil(narration.length / 4)) / 500));
  const narrationButtonLabel = (id: string, narration: string) => {
    if (narrationLoadingId === id) return "Preparing narration…";
    if (currentAudioId === id && playerStatus.playing) return "Pause narration";
    if (cachedNarrations[id] || downloadUrls[id]) return "Narrate (Free)";
    const crowns = narrationCrownEstimate(narration);
    return `Narrate (${crowns} ${crowns === 1 ? "Crown" : "Crowns"})`;
  };
  const openingCalendar = pack.openingScenario?.calendar;
  const openingTurnTitle = currentChapter === 1
    ? openingCalendar
      ? `${openingCalendar.year} · DAY ${openingCalendar.day} · ${openingCalendar.segment.toUpperCase()}`
      : undefined
    : campaign.turns[0]?.turnTitle || campaign.turns[0]?.dateLabel;
  const openingSuggestions =
    pack.openingScenario?.suggestions?.filter(Boolean).slice(0, 3) || [];
  const firstTurnSuggestions =
    openingSuggestions.length > 0
      ? openingSuggestions
      : [
          "Survey the immediate danger",
          "Speak to someone present",
          "Move before the situation changes",
        ];
  const story = (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={s.playMain}
    >
      <View style={s.playHead}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave story and return to stories"
          onPress={onExit}
          style={({ pressed }) => [s.exitStory, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="arrow-back" size={18} color={C.gold} />
          <Text style={s.exitStoryText}>Back to stories</Text>
        </Pressable>
        <View style={s.playHeading}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit campaign title"
            onPress={() => {
              setMetadataTitle(campaign.title);
              setMetadataError("");
              setEditingMetadata(true);
            }}
            style={s.playTitleEdit}
          >
            <Text numberOfLines={1} style={s.playTitle}>
              {campaign.title}
            </Text>
            <Ionicons name="pencil-outline" size={14} color={C.gold} />
          </Pressable>
          <Text style={s.playSub}>
            {
              pack.locations.find((l) => l.id === campaign.state.locationId)
                ?.name
            }
          </Text>
        </View>
        <View style={s.balanceActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${crownBalance} Crowns available. Buy more Crowns.`}
            onPress={onOpenStore}
            style={({ pressed }) => [
              s.intelHeaderButton,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="sparkles" size={18} color={C.gold} />
            <Text style={s.quotaText}>{crownBalance} Crowns</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Open world intelligence"
            onPress={onOpenIntel}
            style={s.intelHeaderButton}
          >
            <Ionicons name="library-outline" size={18} color={C.gold} />
            <Text style={s.intelHeaderText}>World intel</Text>
          </Pressable>
        </View>
      </View>
      <View style={s.storyScrollWrap}>
        <ScrollView
          style={s.storyScroll}
          showsVerticalScrollIndicator={false}
          ref={scroll}
          scrollEventThrottle={16}
          onLayout={(e) =>
            setScrollMetrics((m) => ({
              ...m,
              viewport: e.nativeEvent.layout.height,
            }))
          }
          onScroll={(e) => {
            const offset = readScrollOffset(e);
            setScrollMetrics((m) => ({ ...m, offset }));
            if (offset < 80 && visibleTurnCount < campaign.turns.length)
              setVisibleTurnCount((count) => Math.min(campaign.turns.length, count + 20));
          }}
          contentContainerStyle={s.story}
          onContentSizeChange={(_, height) => {
            setScrollMetrics((m) => ({ ...m, content: height }));
            scroll.current?.scrollToEnd({ animated: false });
          }}
        >
          <Text style={s.chapter}>{chapterHeading}</Text>
          {openingTurnTitle && <Text style={s.chapter}>{openingTurnTitle}</Text>}
          <Text style={s.narration}>{chapterOpening}</Text>
          <View style={s.narrationActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                currentAudioId === "opening" && playerStatus.playing
                  ? "Pause opening narration"
                  : `${narrationButtonLabel("opening", chapterOpening)} for the opening passage`
              }
              disabled={narrationLoadingId === "opening"}
              onPress={() => requestNarration("opening")}
              style={({ pressed }) => [
                s.narrateButton,
                pressed && { opacity: 0.7 },
              ]}
            >
              {narrationLoadingId === "opening" ? (
                <ActivityIndicator size="small" color={C.gold} />
              ) : (
                <Ionicons
                  name={
                    currentAudioId === "opening" && playerStatus.playing
                      ? "pause"
                      : "volume-high-outline"
                  }
                  size={16}
                  color={C.gold}
                />
              )}
              <Text style={s.narrateText}>
                {narrationButtonLabel("opening", chapterOpening)}
              </Text>
            </Pressable>
            {downloadUrls.opening && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Download opening narration audio"
                onPress={async () => {
                  try {
                    await Linking.openURL(downloadUrls.opening);
                  } catch {
                    setNarrationError(
                      "The audio download could not be opened.",
                    );
                  }
                }}
                style={({ pressed }) => [
                  s.narrateButton,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="download-outline" size={16} color={C.gold} />
                <Text style={s.narrateText}>Download</Text>
              </Pressable>
            )}
            {campaign.turns.length === 0 && !sending && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  suggestionsTurnId === "opening"
                    ? "Hide suggested opening actions"
                    : "Show suggested opening actions"
                }
                onPress={() =>
                  setSuggestionsTurnId((current) =>
                    current === "opening" ? "" : "opening",
                  )
                }
                style={({ pressed }) => [
                  s.narrateButton,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons
                  name={
                    suggestionsTurnId === "opening"
                      ? "close-outline"
                      : "compass-outline"
                  }
                  size={16}
                  color={C.gold}
                />
                <Text style={s.narrateText}>
                  {suggestionsTurnId === "opening"
                    ? "Hide suggestions"
                    : "Suggestions"}
                </Text>
              </Pressable>
            )}
          </View>
          {campaign.turns.length === 0 &&
            suggestionsTurnId === "opening" &&
            !sending && (
              <View style={s.suggestions}>
                {firstTurnSuggestions.map((x) => (
                  <Pressable
                    key={x}
                    onPress={() => send(x)}
                    style={s.suggestion}
                  >
                    <Text style={s.suggestionText}>{x}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          {visibleTurnCount < campaign.turns.length && (
            <Pressable onPress={() => setVisibleTurnCount((count) => Math.min(campaign.turns.length, count + 20))} style={s.loadEarlier}>
              <Ionicons name="time-outline" size={16} color={C.gold} />
              <Text style={s.goldText}>{`${campaign.turns.length - visibleTurnCount} earlier turns unloaded · Load more`}</Text>
            </Pressable>
          )}
          {visibleTurns.map((t) => (
            <View key={t.id} style={{ gap: 16 }}>
              <View style={s.playerTurn}>
                <Text style={s.playerText}>{t.playerText}</Text>
                <Text style={s.intentLine}>
                  {[
                    ...t.intent.speech.map((x) => `Said: “${x}”`),
                    ...t.intent.actions.map((x) => `Action: ${x}`),
                  ].join("  ·  ")}
                </Text>
              </View>
              {(t.turnTitle || t.dateLabel) && <Text style={s.chapter}>{t.turnTitle || t.dateLabel}</Text>}
              <Text style={s.narration}>{t.narration}</Text>
              <View style={s.narrationActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    currentAudioId === t.id && playerStatus.playing
                      ? "Pause AI narration"
                      : `${narrationButtonLabel(t.id, t.narration)} for this passage`
                  }
                  disabled={narrationLoadingId === t.id}
                  onPress={() => requestNarration(t.id)}
                  style={({ pressed }) => [
                    s.narrateButton,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  {narrationLoadingId === t.id ? (
                    <ActivityIndicator size="small" color={C.gold} />
                  ) : (
                    <Ionicons
                      name={
                        currentAudioId === t.id && playerStatus.playing
                          ? "pause"
                          : "volume-high-outline"
                      }
                      size={16}
                      color={C.gold}
                    />
                  )}
                  <Text style={s.narrateText}>
                    {narrationButtonLabel(t.id, t.narration)}
                  </Text>
                </Pressable>
                {downloadUrls[t.id] && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Download narration audio"
                    onPress={async () => {
                      try {
                        await Linking.openURL(downloadUrls[t.id]);
                      } catch {
                        setNarrationError(
                          "The audio download could not be opened.",
                        );
                      }
                    }}
                    style={({ pressed }) => [
                      s.narrateButton,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Ionicons
                      name="download-outline"
                      size={16}
                      color={C.gold}
                    />
                    <Text style={s.narrateText}>Download</Text>
                  </Pressable>
                )}
                {t.id === campaign.turns[campaign.turns.length - 1]?.id &&
                  t.suggestions.length > 0 &&
                  !sending && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        suggestionsTurnId === t.id
                          ? "Hide suggested actions"
                          : "Show suggested actions"
                      }
                      onPress={() =>
                        setSuggestionsTurnId((current) =>
                          current === t.id ? "" : t.id,
                        )
                      }
                      style={({ pressed }) => [
                        s.narrateButton,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Ionicons
                        name={
                          suggestionsTurnId === t.id
                            ? "close-outline"
                            : "compass-outline"
                        }
                        size={16}
                        color={C.gold}
                      />
                      <Text style={s.narrateText}>
                        {suggestionsTurnId === t.id
                          ? "Hide suggestions"
                          : "Suggestions"}
                      </Text>
                    </Pressable>
                  )}
                {isSupabaseConfigured && (
                  <Pressable accessibilityRole="button" accessibilityLabel="Give feedback on this response" onPress={() => setFeedbackTurnId(t.id)} style={[s.narrateButton, turnFeedback[t.id] && s.feedbackSubmitted]}>
                    <Ionicons name={turnFeedback[t.id] ? "checkmark-circle-outline" : "chatbox-ellipses-outline"} size={16} color={C.gold} />
                    <Text style={s.narrateText}>{turnFeedback[t.id] ? "Feedback sent" : "Feedback"}</Text>
                  </Pressable>
                )}
              </View>
              {t.id === campaign.turns[campaign.turns.length - 1]?.id &&
                suggestionsTurnId === t.id &&
                !sending && (
                  <View style={s.suggestions}>
                    {t.suggestions.map((x) => (
                      <Pressable
                        key={x}
                        onPress={() => send(x)}
                        style={s.suggestion}
                      >
                        <Text style={s.suggestionText}>{x}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
            </View>
          ))}
          {sending && (
            <View style={s.thinking}>
              <ActivityIndicator color={C.gold} />
              <Text style={s.muted}>The world is answering…</Text>
            </View>
          )}
        </ScrollView>
        {scrollMetrics.content > scrollMetrics.viewport && (
          <View pointerEvents="none" style={s.customScrollTrack}>
            <View
              style={[
                s.customScrollThumb,
                { height: thumbHeight, top: thumbTop },
              ]}
            />
          </View>
        )}
      </View>
      {campaign.state.condition === "dead" ? (
        <View style={s.campaignEnded}>
          <Ionicons name="skull-outline" size={22} color="#E28B84" />
          <View style={{ flex: 1 }}>
            <Text style={s.noticeTitle}>This character has died</Text>
            <Text style={s.copy}>
              Their story is over. The campaign remains available as a permanent
              chronicle.
            </Text>
          </View>
        </View>
      ) : (
        <View style={s.composer}>
          <View style={s.composeRow}>
            <View style={s.composeInputWrap}>
              <TextInput
                testID="composer-input"
                multiline
                value={text}
                editable={!sending}
                selectionColor={C.gold}
                onChangeText={setText}
                placeholder="What do you say or do?"
                placeholderTextColor="#727778"
                style={[s.composeInput, sending && s.composeInputDisabled]}
                onLayout={(e) =>
                  setInputMetrics((m) => ({
                    ...m,
                    viewport: e.nativeEvent.layout.height,
                  }))
                }
                onContentSizeChange={(e) =>
                  setInputMetrics((m) => ({
                    ...m,
                    content: e.nativeEvent.contentSize.height,
                  }))
                }
                onScroll={(e) =>
                  setInputMetrics((m) => ({
                    ...m,
                    offset: readScrollOffset(e),
                  }))
                }
                onSubmitEditing={() => send()}
              />
              <View pointerEvents="none" style={s.inputScrollMask} />
              {inputMetrics.content > inputMetrics.viewport + 2 && (
                <View pointerEvents="none" style={s.inputScrollTrack}>
                  <View
                    style={[
                      s.inputScrollThumb,
                      { height: inputThumbHeight, top: inputThumbTop },
                    ]}
                  />
                </View>
              )}
            </View>
            <Pressable disabled={sending} onPress={dictate} style={[s.voiceInput, listening && s.voiceInputActive, sending && { opacity: 0.4 }]} accessibilityLabel={listening ? 'Stop dictation' : 'Dictate your action'}>
              <Ionicons name={listening ? 'stop' : 'mic-outline'} color={C.gold} size={21} />
            </Pressable>
            <Pressable
              disabled={!text.trim() || sending}
              onPress={() => send()}
              style={[s.send, (!text.trim() || sending) && { opacity: 0.4 }]}
            >
              <Ionicons name="arrow-up" color={C.ink} size={22} />
            </Pressable>
          </View>
          <View style={s.composerHint}><Ionicons name="sparkles-outline" size={12} color={C.goldSoft} /><Text style={s.fine}>Speak, act, or combine both. The game interprets your intent.</Text></View>
        </View>
      )}
      <StoryErrorDialog
        error={error}
        campaignId={campaign.id}
        onClose={() => setError("")}
        onBuyCrowns={onOpenStore}
      />
      <NarrationErrorDialog
        error={narrationError}
        onClose={() => setNarrationError("")}
      />
      <NarrationConfirmDialog
        quote={narrationQuote}
        generating={!!narrationLoadingId}
        skipFuture={pendingSkipNarrationConfirm}
        onSkipChange={setPendingSkipNarrationConfirm}
        onCancel={() => setNarrationQuote(null)}
        onConfirm={async () => {
          if (!narrationQuote) return;
          await saveNarrationConfirmationPreference(
            pendingSkipNarrationConfirm,
          );
          setSkipNarrationConfirm(pendingSkipNarrationConfirm);
          await generateNarration(narrationQuote.turnId);
        }}
      />
      <TurnFeedbackDialog
        turnId={feedbackTurnId}
        saving={feedbackSaving}
        onCancel={() => setFeedbackTurnId("")}
        onHelpful={async () => {
          if (!feedbackTurnId) return;
          setFeedbackSaving(true);
          try {
            await saveTurnResponseFeedback(campaign.id, feedbackTurnId, "helpful");
            setTurnFeedback((current) => ({ ...current, [feedbackTurnId]: "helpful" }));
            setFeedbackTurnId("");
          } catch {
            setError("Your feedback could not be saved.");
          } finally {
            setFeedbackSaving(false);
          }
        }}
        onSubmit={async (category, explanation) => {
          if (!feedbackTurnId) return;
          setFeedbackSaving(true);
          try {
            await saveTurnResponseFeedback(campaign.id, feedbackTurnId, "unhelpful", category, explanation);
            setTurnFeedback((current) => ({ ...current, [feedbackTurnId]: "unhelpful" }));
            setFeedbackTurnId("");
          } catch {
            setError("Your feedback could not be saved.");
          } finally {
            setFeedbackSaving(false);
          }
        }}
      />
      <Modal
        visible={editingMetadata}
        transparent
        animationType="fade"
        onRequestClose={() => !metadataSaving && setEditingMetadata(false)}
      >
        <View style={s.modalBackdrop}>
          <Pressable
            accessibilityLabel="Close campaign details"
            style={StyleSheet.absoluteFill}
            onPress={() => !metadataSaving && setEditingMetadata(false)}
          />
          <View style={s.modalCard}>
            <View style={s.modalIcon}>
              <Ionicons name="create-outline" size={28} color={C.gold} />
            </View>
            <Text style={s.modalTitle}>Campaign details</Text>
            <Text style={s.label}>CAMPAIGN TITLE</Text>
            <TextInput
              value={metadataTitle}
              onChangeText={setMetadataTitle}
              editable={!metadataSaving}
              maxLength={80}
              autoFocus
              placeholder="Campaign title"
              placeholderTextColor="#687074"
              style={s.input}
            />
            {metadataError ? <Text style={s.error}>{metadataError}</Text> : null}
            <View style={s.modalActions}>
              <Button
                label="Cancel"
                kind="ghost"
                disabled={metadataSaving}
                onPress={() => setEditingMetadata(false)}
              />
              <Button
                label={metadataSaving ? "Saving…" : "Save changes"}
                disabled={metadataSaving || metadataTitle.trim().length < 3}
                onPress={async () => {
                  setMetadataSaving(true);
                  setMetadataError("");
                  try {
                    await onUpdateMetadata({ title: metadataTitle.trim() });
                    setEditingMetadata(false);
                  } catch (metadataUpdateError) {
                    setMetadataError(
                      metadataUpdateError instanceof Error
                        ? metadataUpdateError.message
                        : "Campaign details could not be saved.",
                    );
                  } finally {
                    setMetadataSaving(false);
                  }
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
  const side = (
    <View style={s.side}>
      <Text style={s.label}>YOUR CHARACTER</Text>
      <Text style={s.sideName}>{campaign.character.name}</Text>
      <Text style={s.copy}>{campaign.character.background.name}</Text>
      <View style={s.meterRow}>
        <Text style={s.muted}>Health</Text>
        <Text style={s.goldText}>{campaign.state.health}</Text>
      </View>
      <View style={s.meter}>
        <View style={[s.meterFill, { width: `${campaign.state.health}%` }]} />
      </View>
      <View style={s.meterRow}>
        <Text style={s.muted}>Resolve</Text>
        <Text style={s.goldText}>{campaign.state.resolve}</Text>
      </View>
      <View style={s.meter}>
        <View style={[s.meterFill, { width: `${campaign.state.resolve}%` }]} />
      </View>
      <Text style={[s.label, { marginTop: 18 }]}>INVENTORY</Text>
      {campaign.state.inventory.map((x) => (
        <View key={x} style={s.inventory}>
          <Ionicons name="diamond-outline" size={15} color={C.gold} />
          <Text style={s.copy}>{x}</Text>
        </View>
      ))}
      <Text style={[s.label, { marginTop: 18 }]}>KNOWN THREADS</Text>
      {visibleThreads.map((x, index) => (
        <Text key={`${x}-${index}`} style={s.thread}>
          • {x}
        </Text>
      ))}
      {knownThreads.length > threadPageSize && (
        <View style={s.threadPagination}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous known threads"
            disabled={safeThreadPage === 1}
            onPress={() => setThreadPage((page) => Math.max(1, page - 1))}
            style={[
              s.threadPageButton,
              safeThreadPage === 1 && { opacity: 0.35 },
            ]}
          >
            <Ionicons name="chevron-back" size={15} color={C.gold} />
          </Pressable>
          <Text style={s.threadPageText}>
            {safeThreadPage} / {threadPageCount}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next known threads"
            disabled={safeThreadPage === threadPageCount}
            onPress={() =>
              setThreadPage((page) => Math.min(threadPageCount, page + 1))
            }
            style={[
              s.threadPageButton,
              safeThreadPage === threadPageCount && { opacity: 0.35 },
            ]}
          >
            <Ionicons name="chevron-forward" size={15} color={C.gold} />
          </Pressable>
        </View>
      )}
    </View>
  );
  return (
    <SafeAreaView style={s.playWrap}>
      {wide && side}
      {story}
    </SafeAreaView>
  );
}

function LegacyWorldIntel({
  campaign,
  pack,
  onBack,
}: {
  campaign: Campaign;
  pack: WorldPack;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<
    "characters" | "factions" | "locations" | "resources"
  >("characters");
  const [remoteDb, setRemoteDb] = useState<any>(null);
  const [intelError, setIntelError] = useState("");
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getWorldDatabase(campaign.id)
      .then(setRemoteDb)
      .catch((error) =>
        setIntelError(
          error instanceof Error
            ? error.message
            : "World intelligence could not be loaded.",
        ),
      );
  }, [campaign.id]);
  const currentLocation =
    pack.locations.find((l) => l.id === campaign.state.locationId)?.name ||
    "Unknown";
  const confidence = (level: string) => (
    <View
      style={[
        s.confidence,
        level === "CONFIRMED"
          ? s.confidenceHigh
          : level === "MEDIUM"
            ? s.confidenceMedium
            : s.confidenceLow,
      ]}
    >
      <Text style={s.confidenceText}>{level}</Text>
    </View>
  );
  const locationName = (id: string | null) =>
    remoteDb?.locations.find((location: any) => location.id === id)?.name ||
    "Unknown";
  const entityFor = (id: string) =>
    remoteDb?.entities.find((entity: any) => entity.id === id);
  const characterRows = remoteDb
    ? [
        {
          name: campaign.character.name,
          role: campaign.character.background.name,
          location:
            locationName(
              remoteDb.characters.find(
                (row: any) => row.name === campaign.character.name,
              )?.status?.locationId,
            ) || currentLocation,
          seen: "Current",
          level: "CONFIRMED",
          status: `${campaign.state.health} health · Active`,
        },
        ...remoteDb.knowledge.map((known: any) => {
          const entity = entityFor(known.entity_id);
          const character = remoteDb.characters.find(
            (row: any) => row.entity_id === known.entity_id,
          );
          return {
            name: entity?.canonical_name || character?.name || "Unknown figure",
            role: entity?.public_description || "Identity uncertain",
            location: locationName(known.believed_location_id),
            seen: known.last_confirmed_at
              ? new Date(known.last_confirmed_at).toLocaleString()
              : "Unknown",
            level: String(known.confidence || "unknown").toUpperCase(),
            status: known.known_status?.label || "Status uncertain",
          };
        }),
      ]
    : [
        {
          name: campaign.character.name,
          role: campaign.character.background.name,
          location: currentLocation,
          seen: "Current",
          level: "CONFIRMED",
          status: "Healthy · Active",
        },
        ...pack.npcs.map((npc, index) => ({
          name: npc.name,
          role: npc.description,
          location:
            index === 0
              ? "Northern gallery, Gloamspire"
              : index === 1
                ? "Believed within Gloamspire"
                : "Reed Market district",
          seen:
            index === 0 ? "Moments ago" : index === 1 ? "Today" : "6 days ago",
          level: index === 0 ? "HIGH" : index === 1 ? "MEDIUM" : "LOW",
          status: index === 2 ? "Unconfirmed" : "Active",
        })),
      ];
  const knownLocations = remoteDb
    ? remoteDb.locations
    : pack.locations.map((location: any, index: number) => ({
        ...location,
        public_description: location.description,
        location_type: index === 0 ? "settlement" : "landmark",
      }));
  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.intelPage}>
        <View style={s.intelTop}>
          <Pressable onPress={onBack} style={s.back}>
            <Ionicons name="arrow-back" size={18} color={C.gold} />
            <Text style={s.goldText}>Return to story</Text>
          </Pressable>
          <View style={s.intelSeal}>
            <Ionicons name="library-outline" size={25} color={C.gold} />
          </View>
        </View>
        <SectionTitle
          eyebrow="CAMPAIGN INTELLIGENCE"
          title="World ledger"
          copy="What you know—not necessarily what is true. Reports decay, sources conflict, and locations may be deliberately imprecise."
        />
        <View style={s.intelTabs}>
          {(["characters", "factions", "locations"] as const).map(
            (id) => (
              <Pressable
                key={id}
                onPress={() => setTab(id)}
                style={[s.intelTab, tab === id && s.intelTabActive]}
              >
                <Text style={[s.intelTabText, tab === id && { color: C.gold }]}>
                  {id.toUpperCase()}
                </Text>
              </Pressable>
            ),
          )}
        </View>
        {tab === "characters" && (
          <View style={s.intelTable}>
            <View style={s.intelTableHead}>
              <Text style={[s.intelColHead, { flex: 1.2 }]}>PERSON</Text>
              <Text style={[s.intelColHead, { flex: 1.4 }]}>
                BELIEVED LOCATION
              </Text>
              <Text style={[s.intelColHead, { flex: 0.8 }]}>LAST SEEN</Text>
              <Text style={[s.intelColHead, { width: 90 }]}>CONFIDENCE</Text>
            </View>
            {characterRows.map((row, index) => (
              <View key={`${row.name}-${index}`} style={s.intelRow}>
                <View style={{ flex: 1.2 }}>
                  <Text style={s.intelName}>{row.name}</Text>
                  <Text numberOfLines={2} style={s.intelDetail}>
                    {row.role}
                  </Text>
                </View>
                <View style={{ flex: 1.4 }}>
                  <Text style={s.intelValue}>{row.location}</Text>
                  <Text style={s.intelDetail}>{row.status}</Text>
                </View>
                <Text style={[s.intelValue, { flex: 0.8 }]}>{row.seen}</Text>
                <View style={{ width: 90 }}>{confidence(row.level)}</View>
              </View>
            ))}
          </View>
        )}
        {tab === "factions" && (
          <View style={s.intelCards}>
            {pack.factions.map((f, index) => (
              <View key={f.id} style={s.intelCard}>
                <View style={s.row}>
                  <Text style={s.intelName}>{f.name}</Text>
                  {confidence(index === 0 ? "HIGH" : "MEDIUM")}
                </View>
                <Text style={s.copy}>{f.description}</Text>
                <Text style={s.intelDetail}>
                  Known resources:{" "}
                  {index === 0
                    ? "Mountain levies · strained treasury"
                    : "River barges · grain stores · unknown reserves"}
                </Text>
                <Text style={s.intelDetail}>
                  Disposition: {index === 0 ? "Watchful" : "Uncertain"}
                </Text>
              </View>
            ))}
          </View>
        )}
        {intelError ? <Text style={s.error}>{intelError}</Text> : null}
        {tab === "locations" && (
          <View style={s.intelCards}>
            {knownLocations.map((l: any, index: number) => (
              <View key={l.id} style={s.intelCard}>
                <View style={s.row}>
                  <Text style={s.intelName}>{l.name}</Text>
                  {confidence(index === 0 ? "CONFIRMED" : "MEDIUM")}
                </View>
                <Text style={s.copy}>
                  {l.public_description || l.description}
                </Text>
                <Text style={s.intelDetail}>
                  {index === 0
                    ? "Starting area · exact details known"
                    : `${l.location_type || "Regional"} knowledge · interior details incomplete`}
                </Text>
              </View>
            ))}
          </View>
        )}
        {tab === "resources" && (
          <View style={s.intelCards}>
            <View style={s.intelCard}>
              <Text style={s.intelName}>Personal resources</Text>
              {campaign.state.inventory.map((item) => (
                <View key={item} style={s.resourceLine}>
                  <Ionicons name="diamond-outline" size={15} color={C.gold} />
                  <Text style={s.intelValue}>{item}</Text>
                  <Text style={s.resourceKnown}>KNOWN</Text>
                </View>
              ))}
            </View>
            <View style={s.intelCard}>
              <Text style={s.intelName}>Strategic estimates</Text>
              <View style={s.resourceLine}>
                <Text style={s.intelValue}>Valehart field strength</Text>
                <Text style={s.intelEstimate}>3,000–5,000</Text>
              </View>
              <View style={s.resourceLine}>
                <Text style={s.intelValue}>Capital grain reserve</Text>
                <Text style={s.intelEstimate}>18–30 days</Text>
              </View>
              <Text style={s.intelDetail}>
                Estimates reflect reports available to your character and may be
                wrong.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function WorldIntel({
  campaign,
  pack,
  onBack,
  onCreditsChanged,
}: {
  campaign: Campaign;
  pack: WorldPack;
  onBack: () => void;
  onCreditsChanged: (balance: number) => void;
}) {
  const [tab, setTab] = useState<
    "characters" | "factions" | "locations" | "resources" | "chapters"
  >("characters");
  const [remoteDb, setRemoteDb] = useState<any>(null);
  const [intelError, setIntelError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedCharacter, setSelectedCharacter] = useState<any>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedChapter, setSelectedChapter] = useState<any>(null);
  const [contextText, setContextText] = useState("");
  const [contextSaving, setContextSaving] = useState(false);
  const [contextMessage, setContextMessage] = useState("");
  const [contextJobs, setContextJobs] = useState<BackgroundJob[]>([]);
  const handledContextJobs = useRef(new Set<string>());
  const [characterSort, setCharacterSort] = useState<{
    key: "name" | "location" | "seen" | "relationship" | "level";
    direction: "asc" | "desc";
  }>({ key: "name", direction: "asc" });
  const pageSize = 8;
  const titleCaseStatus = (value: unknown) =>
    String(value || "Status uncertain")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const characterDisplayStatus = (value: unknown) => {
    const status = String(value || "").trim().toLowerCase();
    if (status === "dead") return "Dead";
    if (["missing", "disappeared"].includes(status)) return "Missing";
    if (["wounded", "injured", "incapacitated"].includes(status)) return "Wounded";
    if (["unknown", "status uncertain", "unconfirmed", ""].includes(status)) return "Unknown";
    return "Alive";
  };
  const statusAwareDescription = (description: unknown, status: unknown) => {
    const text = String(description || "Identity uncertain").trim();
    if (String(status || "").toLowerCase() !== "dead") return text;
    const remaining = text
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !/\b(dying|mortally wounded|impending death|under .*medical care)\b/i.test(sentence))
      .join(" ");
    return ["Confirmed dead.", remaining].filter(Boolean).join(" ");
  };
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getWorldDatabase(campaign.id)
      .then(setRemoteDb)
      .catch((error) =>
        setIntelError(
          error instanceof Error
            ? error.message
            : "World intelligence could not be loaded.",
        ),
      );
  }, [campaign.id]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const jobs = (await listRemoteBackgroundJobs()).filter(
          (job) => job.job_type === "context_research" && job.payload?.campaignId === campaign.id,
        );
        if (cancelled) return;
        setContextJobs(jobs);
        for (const job of jobs) {
          if (handledContextJobs.current.has(job.id) || !["completed", "failed"].includes(job.status)) continue;
          handledContextJobs.current.add(job.id);
          if (job.status === "completed" && typeof (job.result as any)?.cost === "number") {
            const result = job.result as any;
            if (typeof result?.creditsRemaining === "number") onCreditsChanged(result.creditsRemaining);
            const additions = [...(result?.recognized?.characters || []), ...(result?.recognized?.locations || [])];
            const updates = result?.recognized?.updatedCharacters || [];
            setContextMessage(additions.length
              ? `Research complete for ${result.cost} Crown${result.cost === 1 ? "" : "s"}. Added ${additions.join(", ")} to the world ledger${updates.length ? ` and corrected ${updates.join(", ")}` : ""}.`
              : updates.length
                ? `Research complete for ${result.cost} Crown${result.cost === 1 ? "" : "s"}. Corrected ${updates.join(", ")}.`
                : `Research complete for ${result?.cost || 1} Crown${result?.cost === 1 ? "" : "s"}. ${result?.recognized?.summary || "The context will guide future turns."}`);
            setRemoteDb(await getWorldDatabase(campaign.id));
          } else if (job.status === "failed") setContextMessage(job.error_message || "The research job failed. Its Crown hold was returned.");
          else setContextMessage("Research is still being finalized. No completion charge has been settled yet.");
        }
      } catch (error) {
        if (!cancelled) setContextMessage(error instanceof Error ? error.message : "Research jobs could not be refreshed.");
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [campaign.id]);
  useEffect(() => setPage(1), [tab, search]);
  useEffect(() => setHistoryPage(1), [selectedCharacter?.name]);
  const currentLocation =
    (remoteDb?.locations || pack.locations).find(
      (location: any) => location.id === campaign.state.locationId,
    )?.name || "Unknown";
  const worldNow = campaign.state.campaignDate
    ? `${campaign.state.campaignDate.year} · Day ${campaign.state.campaignDate.day} · ${campaign.state.campaignDate.segment}`
    : "Current";
  const locationName = (id: string | null) =>
    remoteDb?.locations.find((location: any) => location.id === id)?.name ||
    "Unknown";
  const relationshipScore = (name: string) =>
    Number(
      remoteDb?.relationships?.find(
        (item: any) => item.entity_name.toLowerCase() === name.toLowerCase(),
      )?.score ??
        campaign.state.relationships[name] ??
        0,
    );
  const relationship = (name: string) => {
    const value = relationshipScore(name);
    return value >= 75
      ? "Great"
      : value >= 25
        ? "Good"
        : value <= -75
          ? "Awful"
          : value <= -25
            ? "Bad"
            : "Average";
  };
  const relationshipBadge = (label: string) =>
    label === "--" ? (
      <Text style={s.notApplicable}>--</Text>
    ) : (
      <View
        style={[
          s.confidence,
          label === "Great" || label === "Good"
            ? s.confidenceHigh
            : label === "Awful" || label === "Bad"
              ? s.confidenceLow
              : s.confidenceMedium,
        ]}
      >
        <Text style={s.confidenceText}>{label.toUpperCase()}</Text>
      </View>
    );
  const confidence = (level: string) => (
    <View
      style={[
        s.confidence,
        level === "CONFIRMED" || level === "HIGH"
          ? s.confidenceHigh
          : level === "MEDIUM"
            ? s.confidenceMedium
            : s.confidenceLow,
      ]}
    >
      <Text style={s.confidenceText}>{level}</Text>
    </View>
  );
  const entityFor = (id: string) =>
    remoteDb?.entities.find((entity: any) => entity.id === id);
  const characterRows = remoteDb
    ? [
        {
          name: campaign.character.name,
          role: campaign.character.background.name,
          location: currentLocation,
          seen: worldNow,
          level: "CONFIRMED",
          status: `${campaign.state.health} Health · ${characterDisplayStatus(campaign.state.condition || "alive")}`,
          relationship: "--",
          relationshipScore: 0,
          entityId: remoteDb.characters.find(
            (row: any) => row.name === campaign.character.name,
          )?.entity_id,
          isPlayer: true,
        },
        ...remoteDb.knowledge
          .filter((known: any) => {
            const playerEntityId = remoteDb.characters.find(
              (row: any) => row.name === campaign.character.name,
            )?.entity_id;
            return !playerEntityId || known.entity_id !== playerEntityId;
          })
          .map((known: any) => {
          const entity = entityFor(known.entity_id);
          const character = remoteDb.characters.find(
            (row: any) => row.entity_id === known.entity_id,
          );
          const name =
            entity?.canonical_name || character?.name || "Unknown figure";
          return {
            name,
            role: statusAwareDescription(
              entity?.public_description,
              known.known_status?.label,
            ),
            location: known.believed_location_id
              ? locationName(known.believed_location_id)
              : "Unknown",
            seen: known.known_status?.lastSeenWorldDate || "Unknown",
            level: String(known.confidence || "unknown").toUpperCase(),
            status: characterDisplayStatus(known.known_status?.label),
            relationship: relationship(name),
            relationshipScore: relationshipScore(name),
            entityId: known.entity_id,
            source:
              String(known.known_status?.label || "").toLowerCase() === "dead" &&
              /\b(dying|mortally wounded|medical care)\b/i.test(String(known.source_summary || ""))
                ? "Confirmed dead; this was their last believed location."
                : known.source_summary,
          };
          }),
      ]
    : [
        {
          name: campaign.character.name,
          role: campaign.character.background.name,
          location: currentLocation,
          seen: worldNow,
          level: "CONFIRMED",
          status: `${campaign.state.health} health · ${campaign.state.condition || "alive"}`,
          relationship: "--",
          relationshipScore: 0,
          isPlayer: true,
        },
        ...pack.npcs.map((npc) => ({
          name: npc.name,
          role: npc.description,
          location: "Unknown",
          seen: "Unknown",
          level: "UNKNOWN",
          status: "Status uncertain",
          relationship: relationship(npc.name),
          relationshipScore: relationshipScore(npc.name),
          entityId: npc.id,
        })),
      ];
  const locations = remoteDb
    ? remoteDb.locations
    : pack.locations.map((location) => ({
        ...location,
        public_description: location.description,
        location_type: "unknown",
      }));
  const query = search.trim().toLowerCase();
  const matches = (values: unknown[]) =>
    !query ||
    values.some((value) =>
      String(value || "")
        .toLowerCase()
        .includes(query),
    );
  const filteredCharacters = characterRows.filter((row: any) =>
    matches([row.name]),
  );
  const sortedCharacters = [...filteredCharacters].sort(
    (left: any, right: any) => {
      if (!query && left.isPlayer !== right.isPlayer)
        return left.isPlayer ? -1 : 1;
      const comparison = String(left[characterSort.key] || "").localeCompare(
        String(right[characterSort.key] || ""),
        undefined,
        { sensitivity: "base", numeric: true },
      );
      return characterSort.direction === "asc" ? comparison : -comparison;
    },
  );
  const filteredFactions = pack.factions.filter((faction) =>
    matches([faction.name, faction.description]),
  );
  const filteredLocations = locations.filter((location: any) =>
    matches([
      location.name,
      location.public_description,
      location.description,
      location.location_type,
    ]),
  );
  const filteredChapters = (remoteDb?.chapterSummaries || []).filter(
    (chapter: any) =>
      matches([
        chapter.title,
        chapter.summary,
        chapter.transition_reason,
        chapter.chapter_number,
      ]),
  );
  const resourceItems = remoteDb?.resourceAccounts?.length
    ? remoteDb.resourceAccounts.filter((account: any) =>
        matches([
          account.name,
          account.controller_name,
          account.account_type,
          account.status,
        ]),
      )
    : campaign.state.inventory.filter((item) => matches([item]));
  const activeItems: any[] =
    tab === "characters"
      ? sortedCharacters
      : tab === "factions"
        ? filteredFactions
        : tab === "locations"
          ? filteredLocations
          : tab === "chapters"
            ? filteredChapters
            : resourceItems;
  const pageCount = Math.max(1, Math.ceil(activeItems.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = activeItems.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const pager = activeItems.length > pageSize && (
    <View style={s.pagination}>
      <Pressable
        disabled={safePage === 1}
        onPress={() => setPage((value) => Math.max(1, value - 1))}
        style={[s.pageButton, safePage === 1 && { opacity: 0.35 }]}
      >
        <Ionicons name="chevron-back" size={16} color={C.gold} />
        <Text style={s.goldText}>Previous</Text>
      </Pressable>
      <Text
        style={s.muted}
      >{`Page ${safePage} of ${pageCount} · ${activeItems.length} records`}</Text>
      <Pressable
        disabled={safePage === pageCount}
        onPress={() => setPage((value) => Math.min(pageCount, value + 1))}
        style={[s.pageButton, safePage === pageCount && { opacity: 0.35 }]}
      >
        <Text style={s.goldText}>Next</Text>
        <Ionicons name="chevron-forward" size={16} color={C.gold} />
      </Pressable>
    </View>
  );
  const belongsToSelectedCharacter = (entry: any) => {
    if (!selectedCharacter) return false;
    if (selectedCharacter.entityId && entry?.entity_id)
      return entry.entity_id === selectedCharacter.entityId;
    // Legacy rows created before entity IDs were enforced still need to render.
    return (
      String(entry?.entity_name || "").toLowerCase() ===
      selectedCharacter.name.toLowerCase()
    );
  };
  const selectedHistory = selectedCharacter
    ? (remoteDb?.relationshipHistory || []).filter(
        belongsToSelectedCharacter,
      )
    : [];
  const historyPageSize = 6;
  const historyPageCount = Math.max(1, Math.ceil(selectedHistory.length / historyPageSize));
  const safeHistoryPage = Math.min(historyPage, historyPageCount);
  const visibleHistory = selectedHistory.slice((safeHistoryPage - 1) * historyPageSize, safeHistoryPage * historyPageSize);
  const selectedRoles = selectedCharacter
    ? (remoteDb?.relationshipRoles || []).filter(
        (entry: any) =>
          belongsToSelectedCharacter(entry) && entry.status === "active",
      )
    : [];
  const selectedFormerRoles = selectedCharacter
    ? (remoteDb?.relationshipRoles || []).filter(
        (entry: any) =>
          belongsToSelectedCharacter(entry) && entry.status === "former",
      )
    : [];
  const selectedRoleHistory = selectedCharacter
    ? (remoteDb?.relationshipRoleHistory || []).filter(
        belongsToSelectedCharacter,
      )
    : [];
  const selectedPoliticalStatuses = selectedCharacter
    ? (remoteDb?.politicalStatuses || []).filter(
        (entry: any) => entry.entity_id === selectedCharacter.entityId,
      )
    : [];
  const money = (value: unknown, currency = "gold") =>
    `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
  const changeCharacterSort = (key: typeof characterSort.key) => {
    setCharacterSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
    setPage(1);
  };
  const sortableCharacterHeader = (
    label: string,
    key: typeof characterSort.key,
    style: any,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sort by ${label} ${characterSort.key === key && characterSort.direction === "asc" ? "descending" : "ascending"}`}
      onPress={() => changeCharacterSort(key)}
      style={[s.intelSortHead, style]}
    >
      <Text style={s.intelColHead}>{label}</Text>
      <Ionicons
        name={
          characterSort.key === key
            ? characterSort.direction === "asc"
              ? "chevron-up"
              : "chevron-down"
            : "swap-vertical-outline"
        }
        size={12}
        color={characterSort.key === key ? C.gold : C.muted}
      />
    </Pressable>
  );
  if (selectedChapter)
    return (
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.intelPage}>
          <View style={s.intelTop}>
            <Pressable onPress={() => setSelectedChapter(null)} style={s.back}>
              <Ionicons name="arrow-back" size={18} color={C.gold} />
              <Text style={s.goldText}>Chapter list</Text>
            </Pressable>
            <View style={s.intelSeal}>
              <Ionicons name="book-outline" size={25} color={C.gold} />
            </View>
          </View>
          <SectionTitle
            eyebrow={`CHAPTER ${selectedChapter.chapter_number}`}
            title={
              selectedChapter.title ||
              `Chapter ${selectedChapter.chapter_number}`
            }
            copy={
              selectedChapter.transition_reason ||
              "A completed chapter in this campaign."
            }
          />
          <View style={s.chapterSummaryCard}>
            <Text style={s.label}>CHAPTER SUMMARY</Text>
            <Text style={s.chapterSummaryText}>{selectedChapter.summary}</Text>
          </View>
          <View style={s.dossierGrid}>
            <View style={s.dossierFact}>
              <Text style={s.label}>STORY PROGRESS</Text>
              <Text style={s.intelName}>
                Through turn {selectedChapter.through_turn}
              </Text>
            </View>
            <View style={s.dossierFact}>
              <Text style={s.label}>COMPLETED</Text>
              <Text style={s.intelValue}>
                {new Date(selectedChapter.created_at).toLocaleString()}
              </Text>
            </View>
          </View>
          {!!selectedPoliticalStatuses.length && (
            <>
              <SectionTitle
                eyebrow="TITLES AND CLAIMS"
                title="Political standing"
                copy="Held titles are distinct from ambitions, contemplated claims, and declarations."
              />
              <View style={s.intelCards}>
                {selectedPoliticalStatuses.map((entry: any) => (
                  <View key={entry.id} style={s.resourceLine}>
                    <Ionicons name="ribbon-outline" size={18} color={C.gold} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.intelValue}>{entry.title}</Text>
                      <Text style={s.intelDetail}>{`${titleCaseStatus(entry.kind)} · ${titleCaseStatus(entry.status)} — ${entry.reason}`}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
          <SectionTitle
            eyebrow="CARRIED FORWARD"
            title="Unresolved threads"
            copy="These questions remained open when the chapter ended."
          />
          {Array.isArray(selectedChapter.unresolved_threads) &&
          selectedChapter.unresolved_threads.length ? (
            <View style={s.intelCards}>
              {selectedChapter.unresolved_threads.map((thread: string) => (
                <View key={thread} style={s.resourceLine}>
                  <Ionicons
                    name="help-circle-outline"
                    size={17}
                    color={C.gold}
                  />
                  <Text style={s.intelValue}>{thread}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={s.notice}>
              <Ionicons
                name="checkmark-circle-outline"
                size={22}
                color={C.green}
              />
              <Text style={s.copy}>
                No unresolved threads were carried forward.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  if (selectedCharacter)
    return (
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.intelPage}>
          <View style={s.intelTop}>
            <Pressable
              onPress={() => setSelectedCharacter(null)}
              style={s.back}
            >
              <Ionicons name="arrow-back" size={18} color={C.gold} />
              <Text style={s.goldText}>Character summary</Text>
            </Pressable>
            <View style={s.intelSeal}>
              <Ionicons name="person-outline" size={25} color={C.gold} />
            </View>
          </View>
          <SectionTitle
            eyebrow="CHARACTER DOSSIER"
            title={selectedCharacter.name}
            copy={selectedCharacter.role}
          />
          <View style={s.dossierGrid}>
            <View style={s.dossierFact}>
              <Text style={s.label}>RELATIONSHIP</Text>
              {relationshipBadge(selectedCharacter.relationship)}
              <Text style={s.intelDetail}>
                {selectedCharacter.isPlayer
                  ? "Your character"
                  : `${selectedCharacter.relationshipScore > 0 ? "+" : ""}${selectedCharacter.relationshipScore} standing`}
              </Text>
            </View>
            <View style={s.dossierFact}>
              <Text style={s.label}>BELIEVED LOCATION</Text>
              <Text style={s.intelName}>{selectedCharacter.location}</Text>
              <Text style={s.intelDetail}>
                {selectedCharacter.source ||
                  "Based on current campaign knowledge"}
              </Text>
            </View>
            <View style={s.dossierFact}>
              <Text style={s.label}>LAST SEEN</Text>
              <Text style={s.intelValue}>{selectedCharacter.seen}</Text>
            </View>
            <View style={s.dossierFact}>
              <Text style={s.label}>STATUS</Text>
              <Text style={s.intelValue}>{selectedCharacter.status}</Text>
              {confidence(selectedCharacter.level)}
            </View>
          </View>
          {!selectedCharacter.isPlayer && (
            <>
              <SectionTitle
                eyebrow="RELATIONSHIP ROLES"
                title="How you are connected"
                copy="Several connections can exist at the same time. Ending one does not erase the others."
              />
              {selectedRoles.length ? (
                <View style={s.intelCards}>
                  <View style={[s.intelCard, { gap: 9 }]}>
                    {selectedRoles.map((role: any) => (
                      <Text key={role.id} style={[s.intelValue, { color: C.white }]}>
                        {`• ${titleCaseStatus(role.relationship_type)}${role.private ? " (Private)" : ""}`}
                      </Text>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={s.notice}>
                  <Ionicons name="link-outline" size={22} color={C.gold} />
                  <Text style={s.copy}>No specific relationship roles are currently recorded.</Text>
                </View>
              )}
              {!!selectedFormerRoles.length && (
                <View style={s.notice}>
                  <Ionicons name="time-outline" size={22} color={C.muted} />
                  <Text style={s.copy}>
                    {`Former: ${selectedFormerRoles.map((role: any) => role.relationship_type).join(", ")}`}
                  </Text>
                </View>
              )}
              {!!selectedRoleHistory.length && (
                <View style={s.intelCards}>
                  {selectedRoleHistory.slice(0, 12).map((entry: any) => (
                    <View key={entry.id} style={s.relationshipEvent}>
                      <Ionicons name="git-compare-outline" size={18} color={C.gold} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.intelValue}>{`${entry.change_type}: ${entry.relationship_type}`}</Text>
                        <Text style={s.intelDetail}>{entry.reason}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
          <SectionTitle
            eyebrow="RELATIONSHIP HISTORY"
            title="Why your standing changed"
            copy="Only events that actually affected this relationship are recorded."
          />
          {selectedCharacter.isPlayer ? (
            <View style={s.notice}>
              <Ionicons name="person-outline" size={22} color={C.gold} />
              <Text style={s.copy}>
                This is your player character, so no relationship score is
                calculated.
              </Text>
            </View>
          ) : selectedHistory.length ? (
            <View style={s.intelCards}>
              {visibleHistory.map((entry: any) => (
                <View key={entry.id} style={s.relationshipEvent}>
                  <View
                    style={[
                      s.relationshipDelta,
                      entry.change > 0
                        ? s.relationshipPositive
                        : s.relationshipNegative,
                    ]}
                  >
                    <Text style={s.relationshipDeltaText}>
                      {entry.change > 0 ? "+" : ""}
                      {entry.change}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.intelValue}>{entry.reason}</Text>
                    <Text style={s.intelDetail}>
                      {new Date(entry.created_at).toLocaleString()}
                    </Text>
                  </View>
                </View>
              ))}
              {selectedHistory.length > historyPageSize && (
                <View style={s.pagination}>
                  <Pressable disabled={safeHistoryPage === 1} onPress={() => setHistoryPage((value) => Math.max(1, value - 1))} style={[s.pageButton, safeHistoryPage === 1 && { opacity: 0.35 }]}>
                    <Ionicons name="chevron-back" size={16} color={C.gold} />
                    <Text style={s.goldText}>Previous</Text>
                  </Pressable>
                  <Text style={s.muted}>{`Page ${safeHistoryPage} of ${historyPageCount} · ${selectedHistory.length} events`}</Text>
                  <Pressable disabled={safeHistoryPage === historyPageCount} onPress={() => setHistoryPage((value) => Math.min(historyPageCount, value + 1))} style={[s.pageButton, safeHistoryPage === historyPageCount && { opacity: 0.35 }]}>
                    <Text style={s.goldText}>Next</Text>
                    <Ionicons name="chevron-forward" size={16} color={C.gold} />
                  </Pressable>
                </View>
              )}
            </View>
          ) : (
            <View style={s.notice}>
              <Ionicons name="remove-circle-outline" size={22} color={C.gold} />
              <Text style={s.copy}>
                No relationship-changing events have occurred yet. The current
                standing is neutral.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.intelPage}>
        <View style={s.intelTop}>
          <Pressable onPress={onBack} style={s.back}>
            <Ionicons name="arrow-back" size={18} color={C.gold} />
            <Text style={s.goldText}>Return to story</Text>
          </Pressable>
          <View style={s.intelSeal}>
            <Ionicons name="library-outline" size={25} color={C.gold} />
          </View>
        </View>
        <SectionTitle
          eyebrow="CAMPAIGN INTELLIGENCE"
          title="World ledger"
          copy="What your character currently believes—not necessarily what is objectively true."
        />
        <View style={s.formCard}>
          <Text style={s.label}>ADD WORLD CONTEXT</Text>
          <Text style={s.copy}>Add missing continuity or ask for researched people and places. Research uses up to four web searches, costs 1 Crown per $0.02 of actual AI spend, and is capped at 10 Crowns.</Text>
          <View style={s.notice}>
            <Ionicons name="information-circle-outline" size={22} color={C.gold} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.noticeTitle}>You can leave this page</Text>
              <Text style={s.copy}>Your request runs safely in the background. If Sable Crown remains open, an in-app notice appears when it finishes. Enabled mobile push or email notifications can let you know while the app is closed.</Text>
            </View>
          </View>
          <TextInput
            multiline
            maxLength={4000}
            value={contextText}
            onChangeText={(value) => { setContextText(value); setContextMessage(""); }}
            placeholder="Example: Renly has considered claiming the throne, but has not proclaimed himself king."
            placeholderTextColor="#687074"
            style={[s.input, { minHeight: 92, textAlignVertical: "top" }]}
          />
          <Button
            label={contextSaving ? "Researching…" : "Research & add context (up to 10 Crowns)"}
            disabled={contextSaving || contextText.trim().length < 10}
            onPress={async () => {
              setContextSaving(true);
              setContextMessage("");
              try {
                const queued = await queueRemoteCampaignContext(campaign.id, contextText);
                onCreditsChanged(queued.creditsRemaining);
                setContextText("");
                setContextMessage("Research queued. Ten Crowns are held temporarily; unused Crowns will return when the job finishes.");
              } catch (contextError) {
                setContextMessage(contextError instanceof Error ? contextError.message : "Context could not be saved.");
              } finally {
                setContextSaving(false);
              }
            }}
          />
          {contextJobs.filter((job) => ["queued", "running", "stalled"].includes(job.status)).slice(0, 3).map((job) => (
            <View key={job.id} style={{ gap: 6 }}>
              <View style={s.row}>
                <Text style={[s.goldText, { flex: 1 }]}>{job.progress_message || "Waiting for the research worker…"}</Text>
                <Tag>{job.status.toUpperCase()}</Tag>
              </View>
              <View style={{ height: 5, backgroundColor: C.line }}><View style={{ height: 5, width: `${Math.max(2, Math.min(100, Number(job.progress_percent || 0)))}%`, backgroundColor: C.gold }} /></View>
            </View>
          ))}
          {contextMessage ? <Text style={s.intelDetail}>{contextMessage}</Text> : null}
        </View>
        <View style={s.intelTabs}>
          {(
            [
              "characters",
              "factions",
              "locations",
              "chapters",
            ] as const
          ).map((id) => (
            <Pressable
              key={id}
              onPress={() => {
                setTab(id);
                setSelectedCharacter(null);
                setSelectedChapter(null);
              }}
              style={[s.intelTab, tab === id && s.intelTabActive]}
            >
              <Text style={[s.intelTabText, tab === id && { color: C.gold }]}>
                {id.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={s.authInputWrap}>
          <Ionicons name="search-outline" size={18} color={C.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={`Search ${tab}…`}
            placeholderTextColor="#687074"
            style={s.authInput}
          />
        </View>
        {intelError ? <Text style={s.error}>{intelError}</Text> : null}
        {!visible.length && (
          <View style={s.notice}>
            <Ionicons
              name={tab === "chapters" ? "book-outline" : "help-circle-outline"}
              size={22}
              color={C.gold}
            />
            <Text style={s.copy}>
              {tab === "chapters" && !search.trim()
                ? "No chapters have been completed yet. The current chapter will appear here after a meaningful narrative transition."
                : "No known information matches this search."}
            </Text>
          </View>
        )}
        {tab === "characters" && !!visible.length && (
          <View style={s.intelTable}>
            <View style={[s.intelTableHead, { gap: 24 }]}>
              {sortableCharacterHeader("PERSON", "name", { flex: 1.3 })}
              {sortableCharacterHeader("BELIEVED LOCATION", "location", {
                flex: 1.1,
              })}
              {sortableCharacterHeader("LAST SEEN", "seen", { flex: 1 })}
              {sortableCharacterHeader("RELATIONSHIP", "relationship", {
                width: 82,
              })}
              {sortableCharacterHeader("CONFIDENCE", "level", { width: 82 })}
            </View>
            {visible.map((row: any) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View details for ${row.name}${row.isPlayer ? ", playable character" : ""}`}
                onPress={() => setSelectedCharacter(row)}
                key={row.entityId || `${row.name}-${row.isPlayer ? "player" : "known"}`}
                style={({ pressed }) => [
                  s.intelRow,
                  { gap: 24 },
                  row.isPlayer && s.playerIntelRow,
                  pressed && { backgroundColor: C.coal },
                ]}
              >
                <View style={{ flex: 1.3 }}>
                  <View style={s.playerNameLine}>
                    <Text style={s.intelName}>{row.name}</Text>
                    {row.isPlayer && (
                      <View
                        accessibilityLabel="Playable character"
                        style={s.playerCharacterBadge}
                      >
                        <Ionicons
                          name="game-controller-outline"
                          size={13}
                          color={C.ink}
                        />
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ flex: 1.1 }}>
                  <Text style={s.intelValue}>{row.location}</Text>
                  <Text style={s.intelDetail}>{row.status}</Text>
                </View>
                <Text style={[s.intelValue, { flex: 1 }]}>{row.seen}</Text>
                <View style={{ width: 82 }}>
                  {relationshipBadge(row.relationship)}
                </View>
                <View style={{ width: 82 }}>{confidence(row.level)}</View>
              </Pressable>
            ))}
          </View>
        )}
        {tab === "factions" && (
          <View style={s.intelCards}>
            {visible.map((faction: any) => (
              <View key={faction.id} style={s.intelCard}>
                <Text style={s.intelName}>{faction.name}</Text>
                <Text style={s.copy}>{faction.description}</Text>
                <Text style={s.intelDetail}>
                  Disposition and resources remain estimates until learned in
                  play.
                </Text>
              </View>
            ))}
          </View>
        )}
        {tab === "locations" && (
          <View style={s.intelCards}>
            {visible.map((location: any) => (
              <View key={location.id} style={s.intelCard}>
                <View style={s.row}>
                  <Text style={s.intelName}>{location.name}</Text>
                  {confidence(
                    location.id === campaign.state.locationId
                      ? "CONFIRMED"
                      : "MEDIUM",
                  )}
                </View>
                <Text style={s.copy}>
                  {location.public_description || location.description}
                </Text>
                <Text style={s.intelDetail}>
                  {location.id === campaign.state.locationId
                    ? "Current location · exact details known"
                    : `${location.location_type || "Unknown"} knowledge · details may be incomplete`}
                </Text>
              </View>
            ))}
          </View>
        )}
        {tab === "resources" && (
          <View style={s.intelCards}>
            {visible.map((item: any) =>
              typeof item === "string" ? (
                <View key={item} style={s.resourceLine}>
                  <Ionicons name="diamond-outline" size={15} color={C.gold} />
                  <Text style={s.intelValue}>{item}</Text>
                  <Text style={s.resourceKnown}>KNOWN</Text>
                </View>
              ) : (
                <View key={item.id} style={s.intelCard}>
                  <View style={s.row}>
                    <View>
                      <Text style={s.intelName}>{item.name}</Text>
                      <Text style={s.intelDetail}>
                        {String(item.account_type).toUpperCase()} · controlled
                        by {item.controller_name}
                      </Text>
                    </View>
                    <Tag>{String(item.status).toUpperCase()}</Tag>
                  </View>
                  <View style={s.financeGrid}>
                    <View>
                      <Text style={s.label}>BALANCE</Text>
                      <Text style={s.financeBalance}>
                        {money(item.balance, item.currency)}
                      </Text>
                    </View>
                    <View>
                      <Text style={s.label}>RECURRING INCOME</Text>
                      <Text style={s.financePositive}>
                        +{money(item.recurring_income, item.currency)}
                      </Text>
                    </View>
                    <View>
                      <Text style={s.label}>RECURRING OUTGOINGS</Text>
                      <Text style={s.financeNegative}>
                        −{money(item.recurring_outgoings, item.currency)}
                      </Text>
                    </View>
                    <View>
                      <Text style={s.label}>NET POSITION</Text>
                      <Text
                        style={
                          Number(item.recurring_income) -
                            Number(item.recurring_outgoings) >=
                          0
                            ? s.financePositive
                            : s.financeNegative
                        }
                      >
                        {money(
                          Number(item.recurring_income) -
                            Number(item.recurring_outgoings),
                          item.currency,
                        )}
                      </Text>
                    </View>
                    {item.morale != null && (
                      <View>
                        <Text style={s.label}>MORALE</Text>
                        <Text style={s.intelValue}>{item.morale}/100</Text>
                      </View>
                    )}
                  </View>
                  {(remoteDb?.resourceTransactions || [])
                    .filter((entry: any) => entry.account_id === item.id)
                    .slice(0, 5)
                    .map((entry: any) => (
                      <View key={entry.id} style={s.resourceTransaction}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.intelValue}>{entry.reason}</Text>
                          <Text style={s.intelDetail}>
                            {entry.world_date ||
                              new Date(entry.created_at).toLocaleDateString()}
                            {entry.counterparty
                              ? ` · ${entry.counterparty}`
                              : ""}
                          </Text>
                        </View>
                        <Text
                          style={
                            Number(entry.amount) >= 0
                              ? s.financePositive
                              : s.financeNegative
                          }
                        >
                          {Number(entry.amount) > 0 ? "+" : ""}
                          {money(entry.amount, item.currency)}
                        </Text>
                      </View>
                    ))}
                </View>
              ),
            )}
          </View>
        )}
        {tab === "chapters" && (
          <View style={s.intelCards}>
            {visible.map((chapter: any) => (
              <Pressable
                key={chapter.id}
                onPress={() => setSelectedChapter(chapter)}
                style={({ pressed }) => [
                  s.chapterListCard,
                  pressed && { backgroundColor: C.coal },
                ]}
              >
                <View style={s.chapterNumber}>
                  <Text style={s.chapterNumberText}>
                    {chapter.chapter_number}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.intelName}>
                    {chapter.title || `Chapter ${chapter.chapter_number}`}
                  </Text>
                  <Text numberOfLines={2} style={s.copy}>
                    {chapter.summary}
                  </Text>
                  <Text style={s.intelDetail}>
                    {chapter.transition_reason ||
                      `Completed through turn ${chapter.through_turn}`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={C.gold} />
              </Pressable>
            ))}
          </View>
        )}
        {pager}
      </ScrollView>
    </SafeAreaView>
  );
}

function Packs({
  data,
  startWorld,
  openBuilder,
  importPack,
  deleteWorld,
}: {
  data: AppData;
  startWorld: (p: WorldPack) => void;
  openBuilder: () => void;
  importPack: (p: WorldPack) => Promise<{ pack: WorldPack; cost: number }>;
  deleteWorld: (p: WorldPack) => Promise<void>;
}) {
  const [report, setReport] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<WorldPack | null>(null);
  const [conflictPack, setConflictPack] = useState<WorldPack | null>(null);
  const [pendingImport, setPendingImport] = useState<WorldPack | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiWorld, setAiWorld] = useState("");
  const [aiCharacter, setAiCharacter] = useState("");
  const [aiStart, setAiStart] = useState("");
  const [backgroundJobs, setBackgroundJobs] = useState<BackgroundJob[]>([]);
  const [newWorldVersionId, setNewWorldVersionId] = useState("");
  const [jobsError, setJobsError] = useState("");
  const pageSize = 6;
  const refreshJobs = async () => {
    if (!isSupabaseConfigured) return;
    try {
      const jobs = (await listRemoteBackgroundJobs()).filter(
        (job) => job.job_type === "generate_world",
      );
      for (const job of jobs) {
        const pack = job.result?.pack;
        if (job.status === "completed" && pack) {
          const versionKey =
            pack.databaseVersionId || `${pack.id}-${pack.version}`;
          if (
            !data.packs.some(
              (existing) =>
                existing.databaseVersionId === pack.databaseVersionId ||
                (existing.id === pack.id && existing.version === pack.version),
            )
          )
            data.packs.push(pack);
          if (
            !newWorldVersionId &&
            Date.now() -
              new Date(job.completed_at || job.updated_at).getTime() <
              24 * 60 * 60 * 1000
          ) {
            setNewWorldVersionId(versionKey);
            setPage(1);
          }
        }
        if (
          job.status === "completed" &&
          data.user &&
          typeof job.result?.creditsRemaining === "number"
        )
          data.user.creditsRemaining = job.result.creditsRemaining;
      }
      setBackgroundJobs(jobs);
      setJobsError("");
    } catch (error) {
      setJobsError(
        error instanceof Error
          ? error.message
          : "Background jobs could not be refreshed.",
      );
    }
  };
  useEffect(() => {
    void refreshJobs();
    const timer = setInterval(
      () => void refreshJobs(),
      backgroundJobs.some((job) =>
        ["queued", "running", "stalled"].includes(job.status),
      )
        ? 2500
        : 10000,
    );
    return () => clearInterval(timer);
  }, [
    backgroundJobs.some((job) =>
      ["queued", "running", "stalled"].includes(job.status),
    ),
  ]);
  const visibleJobs = backgroundJobs
    .filter((job) => ["queued", "running", "stalled"].includes(job.status))
    .slice(0, 10);
  const custom = [
    ...data.packs
      .filter((pack) => pack.ownerId !== "system")
      .reduce((latest, pack) => {
        const current = latest.get(pack.id);
        if (!current || pack.version > current.version)
          latest.set(pack.id, pack);
        return latest;
      }, new Map<string, WorldPack>())
      .values(),
  ].sort((a, b) => {
    const aNew =
      newWorldVersionId === (a.databaseVersionId || `${a.id}-${a.version}`);
    const bNew =
      newWorldVersionId === (b.databaseVersionId || `${b.id}-${b.version}`);
    return (
      Number(bNew) - Number(aNew) ||
      a.metadata.title.localeCompare(b.metadata.title)
    );
  });
  const pageCount = Math.max(1, Math.ceil(custom.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleCustom = custom.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const pick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain", "text/markdown"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > 500_000)
        return setReport(["Pack exceeds the 500 KB limit."]);
      const raw = await (await fetch(asset.uri)).text();
      if (!asset.name.endsWith(".json"))
        return setReport([
          "Markdown template import is documented and reserved for the server parser. Upload the JSON form of the template in this local build.",
        ]);
      const parsed = JSON.parse(raw);
      const resultV = validatePack(parsed, {
        author: data.user?.name,
        ownerId: data.user?.id,
      });
      const normalized = normalizeWorldPackInput(
        parsed,
        data.user?.name,
        data.user?.id,
      ) as WorldPack;
      const conflicts = findLocationNameConflicts(normalized);
      const otherErrors = resultV.errors.filter(
        (error) => !error.startsWith("Duplicate location names:"),
      );
      if (conflicts.length && otherErrors.length === 0) {
        setReport([]);
        setConflictPack(normalized);
      } else if (!resultV.valid || !resultV.pack) setReport(resultV.errors);
      else {
        setReport(resultV.warnings);
        setPendingImport(resultV.pack);
      }
    } catch (e) {
      setReport([e instanceof Error ? e.message : "Could not read this pack."]);
    }
  };
  const resolveConflict = (
    action: "rename" | "keep" | "merge",
    primaryId?: string,
    customNames?: Record<string, string>,
  ) => {
    if (!conflictPack) return;
    try {
      const conflict = findLocationNameConflicts(conflictPack)[0];
      if (!conflict) return;
      const resolved = resolveLocationNameConflict(
        conflictPack,
        conflict,
        action,
        primaryId,
        customNames,
      );
      const remaining = findLocationNameConflicts(resolved);
      if (remaining.length) setConflictPack(resolved);
      else {
        const validation = validatePack(resolved, {
          author: data.user?.name,
          ownerId: data.user?.id,
        });
        setConflictPack(null);
        if (!validation.valid || !validation.pack) setReport(validation.errors);
        else {
          setReport(validation.warnings);
          setPendingImport(validation.pack);
        }
      }
    } catch (error) {
      setReport([
        error instanceof Error
          ? error.message
          : "That conflict could not be resolved.",
      ]);
    }
  };
  const downloadTemplate = () => {
    const json = JSON.stringify(downloadableWorldPackTemplate, null, 2);
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "sable-crown-world-template.json";
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }
    void Linking.openURL(
      `data:application/json;charset=utf-8,${encodeURIComponent(json)}`,
    );
  };
  return (
    <>
      <ScrollView contentContainerStyle={s.page}>
        <SectionTitle
          eyebrow="PRIVATE LIBRARY"
          title="Your worlds"
          copy="Ask AI to research and prepare a private setting, or import a world built from the published JSON template."
        />
        <View style={s.actions}>
          <Button
            label="Create with AI · 20 Crowns"
            icon="sparkles-outline"
            onPress={() => setAiOpen(true)}
          />
          <Button
            label="Import JSON · 2 Crowns"
            icon="cloud-upload-outline"
            kind="ghost"
            onPress={pick}
          />
        </View>
        {jobsError ? <Text style={s.error}>{jobsError}</Text> : null}
        {visibleJobs.length > 0 && (
          <View style={{ gap: 12 }}>
            <View>
              <Text style={s.label}>BACKGROUND WORLD JOBS</Text>
              <Text style={s.copy}>
                These continue on the server if you close the app.
              </Text>
            </View>
            {visibleJobs.map((job) => {
              const active = ["queued", "running", "stalled"].includes(
                job.status,
              );
              const world = job.payload?.world || "Untitled world";
              const percent =
                job.status === "completed"
                  ? 100
                  : Math.max(
                      0,
                      Math.min(100, Number(job.progress_percent || 0)),
                    );
              return (
                <View
                  key={job.id}
                  style={[s.packCard, { alignItems: "stretch" }]}
                >
                  <View style={s.packIcon}>
                    <Ionicons
                      name={
                        job.status === "failed"
                          ? "warning-outline"
                          : job.status === "completed"
                            ? "checkmark-circle-outline"
                            : "sparkles-outline"
                      }
                      size={28}
                      color={
                        job.status === "failed"
                          ? "#E28B84"
                          : job.status === "completed"
                            ? C.green
                            : C.gold
                      }
                    />
                  </View>
                  <View style={{ flex: 1, gap: 9 }}>
                    <View style={s.row}>
                      <Text style={[s.cardTitle, { flex: 1 }]}>{world}</Text>
                      <Tag>{job.status.toUpperCase()}</Tag>
                    </View>
                    <View>
                      <View style={[s.row, { marginBottom: 6 }]}>
                        <Text style={[s.goldText, { flex: 1 }]}>
                          {job.progress_message ||
                            (active
                              ? "Waiting for the next update…"
                              : job.status === "completed"
                                ? "Finished and saved."
                                : "This job stopped.")}
                        </Text>
                        <Text style={s.muted}>{percent}%</Text>
                      </View>
                      <View style={{ height: 5, backgroundColor: C.line }}>
                        <View
                          style={{
                            height: 5,
                            width: `${percent}%`,
                            backgroundColor:
                              job.status === "failed"
                                ? "#A84D49"
                                : job.status === "completed"
                                  ? C.green
                                  : C.gold,
                          }}
                        />
                      </View>
                    </View>
                    <Text style={s.muted}>Cost on success: 20 Crowns</Text>
                    {job.status === "failed" && (
                      <Text style={s.error}>
                        {job.error_message ||
                          "The job stopped before completion. No generation Crowns were charged."}
                      </Text>
                    )}
                    {job.status === "completed" && job.result?.pack && (
                      <View style={s.row}>
                        <Text style={s.success}>
                          Saved privately as {job.result.pack.metadata.title}.
                        </Text>
                        <Pressable
                          onPress={() => startWorld(job.result!.pack!)}
                        >
                          <Text style={s.goldText}>Start a campaign →</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
        {report.map((x, i) => (
          <Text
            key={i}
            style={
              x.includes("saved") ||
              x.includes("created") ||
              x.includes("queued")
                ? s.success
                : s.error
            }
          >
            {x}
          </Text>
        ))}
        <View style={s.packCard}>
          <View style={s.packIcon}>
            <Ionicons name="bonfire-outline" size={28} color={C.gold} />
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <View style={s.row}>
              <Text style={s.cardTitle}>{defaultWorld.metadata.title}</Text>
              <Tag>OFFICIAL</Tag>
            </View>
            <Text style={s.copy}>{defaultWorld.metadata.description}</Text>
            <Pressable onPress={() => startWorld(defaultWorld)}>
              <Text style={s.goldText}>Start a campaign →</Text>
            </Pressable>
          </View>
        </View>
        {visibleCustom.map((p) => {
          const isNew =
            newWorldVersionId ===
            (p.databaseVersionId || `${p.id}-${p.version}`);
          return (
            <View
              key={`${p.id}-${p.version}`}
              style={[
                s.packCard,
                isNew && { borderColor: C.green, backgroundColor: "#15201C" },
              ]}
            >
              <View style={s.packIcon}>
                <Ionicons
                  name={isNew ? "sparkles-outline" : "map-outline"}
                  size={28}
                  color={isNew ? C.green : C.gold}
                />
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <View style={s.row}>
                  <View
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 9,
                    }}
                  >
                    <Text style={s.cardTitle}>{p.metadata.title}</Text>
                    {isNew && <Tag>NEWLY GENERATED</Tag>}
                    <Tag>{`PRIVATE · V${p.version}`}</Tag>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${p.metadata.title}`}
                    onPress={() => setPendingDelete(p)}
                    style={s.deleteCampaignButton}
                  >
                    <Ionicons name="trash-outline" size={17} color="#E28B84" />
                  </Pressable>
                </View>
                <Text style={s.copy}>{p.metadata.description}</Text>
                <Pressable
                  onPress={() => {
                    setNewWorldVersionId("");
                    startWorld(p);
                  }}
                >
                  <Text style={s.goldText}>Start a campaign →</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
        {custom.length > pageSize && (
          <View style={s.pagination}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous private worlds page"
              disabled={safePage === 1}
              onPress={() => setPage((value) => Math.max(1, value - 1))}
              style={[s.pageButton, safePage === 1 && { opacity: 0.35 }]}
            >
              <Ionicons name="chevron-back" size={16} color={C.gold} />
              <Text style={s.goldText}>Previous</Text>
            </Pressable>
            <Text style={s.muted}>{`Page ${safePage} of ${pageCount}`}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next private worlds page"
              disabled={safePage === pageCount}
              onPress={() => setPage((value) => Math.min(pageCount, value + 1))}
              style={[
                s.pageButton,
                safePage === pageCount && { opacity: 0.35 },
              ]}
            >
              <Text style={s.goldText}>Next</Text>
              <Ionicons name="chevron-forward" size={16} color={C.gold} />
            </Pressable>
          </View>
        )}
        <View style={s.templateBox}>
          <Ionicons name="document-text-outline" size={24} color={C.gold} />
          <View style={{ flex: 1, gap: 9 }}>
            <Text style={s.noticeTitle}>World author template</Text>
            <Text style={s.copy}>
              Download a complete, original-world example. Ownership, IDs,
              author, readiness, and version numbers are filled in automatically
              when you upload it.
            </Text>
            <View style={s.actions}>
              <Button
                label="Download JSON template"
                icon="download-outline"
                kind="ghost"
                onPress={downloadTemplate}
              />
            </View>
          </View>
        </View>
        <Modal
          visible={aiOpen}
          transparent
          animationType="fade"
          onRequestClose={() => !aiGenerating && setAiOpen(false)}
        >
          <View style={s.modalBackdrop}>
            <View style={s.modalCard}>
              <View style={s.modalIcon}>
                <Ionicons name="sparkles-outline" size={28} color={C.gold} />
              </View>
              <Text style={s.modalTitle}>
                Create a campaign-ready world with AI
              </Text>
              <Text style={s.modalBody}>
                Research and generation cost 18 Crowns and validation/private
                storage costs 2 Crowns: 20 Crowns total. The full amount is
                reserved when the job starts, preventing it from being spent
                elsewhere, and is released if generation ultimately fails.
              </Text>
              <View
                style={[
                  s.formCard,
                  { width: "100%", padding: 0, borderWidth: 0 },
                ]}
              >
                <View style={{ gap: 7 }}>
                  <Text style={s.label}>WORLD OR SETTING</Text>
                  <TextInput
                    value={aiWorld}
                    onChangeText={setAiWorld}
                    placeholder="An original realm, or a setting you may privately use"
                    placeholderTextColor="#687074"
                    style={s.input}
                  />
                </View>
                <View style={{ gap: 7 }}>
                  <Text style={s.label}>PLAYABLE CHARACTER</Text>
                  <TextInput
                    value={aiCharacter}
                    onChangeText={setAiCharacter}
                    placeholder="Name and identity"
                    placeholderTextColor="#687074"
                    style={s.input}
                  />
                </View>
                <View style={{ gap: 7 }}>
                  <Text style={s.label}>STARTING POINT · OPTIONAL</Text>
                  <TextInput
                    value={aiStart}
                    onChangeText={setAiStart}
                    placeholder="Where and when should the story begin? Include essential relationships or facts."
                    placeholderTextColor="#687074"
                    style={s.input}
                  />
                </View>
              </View>
              <View style={s.notice}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={20}
                  color={C.green}
                />
                <Text style={[s.copy, { flex: 1 }]}>
                  Only generate settings you are entitled to use. Packs remain
                  private and store concise factual summaries and source
                  links—not copied passages or artwork.
                </Text>
              </View>
              <View style={s.modalActions}>
                <Button
                  label="Cancel"
                  kind="ghost"
                  disabled={aiGenerating}
                  onPress={() => setAiOpen(false)}
                />
                <Button
                  label={
                    aiGenerating
                      ? "Reserving Crowns…"
                      : "Research, generate and save · 20 Crowns"
                  }
                  disabled={
                    aiGenerating ||
                    aiWorld.trim().length < 3 ||
                    aiCharacter.trim().length < 2
                  }
                  onPress={async () => {
                    setAiGenerating(true);
                    try {
                      const world = aiWorld.trim();
                      const character = aiCharacter.trim();
                      const queued = await queueRemoteWorldPack(
                        world,
                        character,
                        aiStart.trim(),
                      );
                      if (
                        data.user &&
                        typeof queued.creditsRemaining === "number"
                      )
                        data.user.creditsRemaining = queued.creditsRemaining;
                      setAiOpen(false);
                      setAiWorld("");
                      setAiCharacter("");
                      setAiStart("");
                      setReport([
                        `${world} has been queued and 20 Crowns are reserved. You may close the app while the agent works.`,
                      ]);
                      await refreshJobs();
                    } catch (error) {
                      setAiOpen(false);
                      setReport([
                        error instanceof Error
                          ? error.message
                          : "The AI world job could not be started.",
                      ]);
                    } finally {
                      setAiGenerating(false);
                    }
                  }}
                />
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
      <LocationConflictDialog
        conflict={
          conflictPack
            ? findLocationNameConflicts(conflictPack)[0] || null
            : null
        }
        remaining={
          conflictPack ? findLocationNameConflicts(conflictPack).length : 0
        }
        onCancel={() => setConflictPack(null)}
        onResolve={resolveConflict}
      />
      <ImportConfirmDialog
        pack={pendingImport}
        balance={data.user?.creditsRemaining || 0}
        importing={importing}
        onCancel={() => !importing && setPendingImport(null)}
        onConfirm={async () => {
          if (!pendingImport || importing) return;
          setImporting(true);
          try {
            const saved = await importPack(pendingImport);
            setPendingImport(null);
            setReport([
              `Pack validated and saved privately. ${saved.cost} Crown${saved.cost === 1 ? "" : "s"} charged.`,
            ]);
          } catch (error) {
            setPendingImport(null);
            setReport([
              error instanceof Error
                ? error.message
                : "The world could not be imported. No Crowns were charged.",
            ]);
          } finally {
            setImporting(false);
          }
        }}
      />
      <ConfirmDialog
        visible={!!pendingDelete}
        title="Delete this private world?"
        body={
          pendingDelete
            ? `“${pendingDelete.metadata.title}” and every saved version of it will be permanently deleted. Any campaigns using this world must be deleted first.`
            : ""
        }
        confirmLabel={deleting ? "Deleting…" : "Delete world"}
        danger
        onCancel={() => !deleting && setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete || deleting) return;
          setDeleting(true);
          try {
            await deleteWorld(pendingDelete);
            setPendingDelete(null);
          } catch (error) {
            setPendingDelete(null);
            setDeleteError(
              error instanceof Error
                ? error.message
                : "The world could not be deleted. Please try again.",
            );
          } finally {
            setDeleting(false);
          }
        }}
      />
      <WorldDeleteErrorDialog
        error={deleteError}
        onClose={() => setDeleteError("")}
      />
    </>
  );
}

function Builder({
  userId,
  onBack,
  onSave,
}: {
  userId: string;
  onBack: () => void;
  onSave: (p: WorldPack) => void;
}) {
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [premise, setPremise] = useState("");
  const field = (
    label: string,
    value: string,
    setter: (v: string) => void,
    placeholder: string,
    multiline = false,
  ) => (
    <View style={{ gap: 7 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={setter}
        placeholder={placeholder}
        placeholderTextColor="#687074"
        multiline={multiline}
        style={[
          s.input,
          multiline && { height: 100, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
  const save = () => {
    const id =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || uid("world");
    const seed = (id2: string, name: string): NamedEntry => ({
      id: id2,
      name,
      description: `A defining element of ${title} with enough detail to guide the game master.`,
    });
    const p: WorldPack = {
      ...defaultWorld,
      id,
      version: 1,
      ownerId: userId,
      status: "ready",
      metadata: {
        ...defaultWorld.metadata,
        title,
        tagline,
        author: "Private creator",
        description,
      },
      premise,
      factions: [
        seed("first-power", "The First Power"),
        seed("rival-power", "The Rival Power"),
      ],
      locations: [seed("starting-place", "The Starting Place")],
      cultures: [seed("local-culture", "The Local Culture")],
      npcs: [seed("first-contact", "The First Contact")],
      secrets: [seed("hidden-truth", "The Hidden Truth")],
      scenarioHooks: [seed("opening-hook", "The Opening Hook")],
    };
    const result = validatePack(p);
    if (!result.valid || !result.pack)
      return Alert.alert("Pack needs attention", result.errors.join("\n"));
    onSave(result.pack);
  };
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Pressable onPress={onBack} style={s.back}>
        <Ionicons name="arrow-back" size={18} color={C.muted} />
        <Text style={s.muted}>Worlds</Text>
      </Pressable>
      <SectionTitle
        eyebrow="GUIDED BUILDER"
        title="Create a world"
        copy="Start with the dramatic spine. You can expand the factions, people, and rules in later versions."
      />
      <View style={s.formCard}>
        {field("WORLD TITLE", title, setTitle, "The Glass Republic")}
        {field("TAGLINE", tagline, setTagline, "Every truth has a price.")}
        {field(
          "DESCRIPTION",
          description,
          setDescription,
          "What makes this world distinctive?",
          true,
        )}
        {field(
          "CENTRAL PREMISE",
          premise,
          setPremise,
          "What conflict is already in motion?",
          true,
        )}
        <Button
          label="Validate and save privately"
          icon="shield-checkmark"
          disabled={
            title.length < 3 ||
            tagline.length < 3 ||
            description.length < 20 ||
            premise.length < 40
          }
          onPress={save}
        />
      </View>
      <View style={s.notice}>
        <Ionicons name="git-branch-outline" size={22} color={C.gold} />
        <View style={{ flex: 1 }}>
          <Text style={s.noticeTitle}>Version-safe by design</Text>
          <Text style={s.copy}>
            Future edits create a new pack version. Existing campaigns remain
            pinned to the world they began in.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function Settings({
  data,
  logout,
  reset,
  accessibility,
  setAccessibility,
}: {
  data: AppData;
  logout: () => void;
  reset: (password: string) => Promise<void>;
  accessibility: AccessibilityPreferences;
  setAccessibility: (value: AccessibilityPreferences) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [password, setPassword] = useState("");
  const [jobNotifications, setJobNotifications] = useState({
    email: false,
    push: false,
  });
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  useEffect(() => {
    if (isSupabaseConfigured)
      void getWorldJobNotificationPreferences()
        .then(setJobNotifications)
        .catch(() => {});
  }, []);
  const changeNotification = async (channel: "email" | "push") => {
    if (notificationBusy) return;
    setNotificationBusy(true);
    setNotificationMessage("");
    const next = { ...jobNotifications, [channel]: !jobNotifications[channel] };
    try {
      if (channel === "push" && next.push) {
        if (Platform.OS === "web")
          throw new Error(
            "Push completion notifications are available in the iOS and Android apps.",
          );
        let permission = await Notifications.getPermissionsAsync();
        if (permission.status !== "granted")
          permission = await Notifications.requestPermissionsAsync();
        if (permission.status !== "granted")
          throw new Error("Notification permission was not granted.");
        const token = await Notifications.getExpoPushTokenAsync();
        await registerWorldJobPushToken(token.data, Platform.OS);
      }
      await setWorldJobNotificationPreferences(next);
      setJobNotifications(next);
      setNotificationMessage(
        "Background-job notification preferences saved.",
      );
    } catch (error) {
      setNotificationMessage(
        error instanceof Error
          ? error.message
          : "Notification preferences could not be saved.",
      );
    } finally {
      setNotificationBusy(false);
    }
  };
  const close = () => {
    if (deleting) return;
    setConfirmDelete(false);
    setPassword("");
    setDeleteError("");
  };
  const confirm = async () => {
    if (deleting || password.length < 8) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await reset(password);
      setConfirmDelete(false);
      setPassword("");
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Your account could not be deleted. Nothing was changed.",
      );
    } finally {
      setDeleting(false);
    }
  };
  const notificationToggle = (
    channel: "email" | "push",
    title: string,
    copy: string,
    icon: keyof typeof Ionicons.glyphMap,
  ) => (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{
        checked: jobNotifications[channel],
        disabled: notificationBusy,
      }}
      onPress={() => changeNotification(channel)}
      style={s.settingRow}
    >
      <Ionicons
        name={icon}
        size={20}
        color={jobNotifications[channel] ? C.green : C.muted}
      />
      <View style={{ flex: 1 }}>
        <Text style={s.noticeTitle}>{title}</Text>
        <Text style={s.copy}>{copy}</Text>
      </View>
      <View
        style={{
          width: 50,
          height: 28,
          borderRadius: 14,
          padding: 3,
          backgroundColor: jobNotifications[channel] ? C.gold : C.line,
          alignItems: jobNotifications[channel] ? "flex-end" : "flex-start",
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: jobNotifications[channel] ? C.ink : C.muted,
          }}
        />
      </View>
    </Pressable>
  );
  return (
    <>
      <ScrollView contentContainerStyle={s.page}>
        <SectionTitle
          eyebrow="ACCOUNT"
          title={data.user?.name || "Player"}
          copy={data.user?.username ? `@${data.user.username}` : undefined}
        />
        <View style={s.settingCard}>
          <View style={s.settingRow}>
            <Ionicons name="sparkles-outline" size={20} color={C.gold} />
            <View style={{ flex: 1 }}>
              <Text style={s.noticeTitle}>Crown balance</Text>
              <Text style={s.copy}>
                {data.user?.creditsRemaining} Crowns available for story
                advances, narration, and world imports.
              </Text>
            </View>
          </View>
          <View style={s.settingRow}>
            <Ionicons
              name="shield-checkmark-outline"
              size={20}
              color={C.green}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.noticeTitle}>Mature content boundary</Text>
              <Text style={s.copy}>
                Adult consensual relationships can develop naturally, with
                intimate scenes fading to black. Sexual violence may be
                acknowledged only as a non-graphic off-screen crime or
                historical consequence; it is never depicted or offered as a
                player action.
              </Text>
            </View>
          </View>
          <View style={s.settingRow}>
            <Ionicons name="lock-closed-outline" size={20} color={C.gold} />
            <View style={{ flex: 1 }}>
              <Text style={s.noticeTitle}>Private by default</Text>
              <Text style={s.copy}>
                Your uploaded packs are not listed publicly or used as shared
                training data.
              </Text>
            </View>
          </View>
        </View>
        <Text style={s.label}>ACCESSIBILITY</Text>
        <View style={s.settingCard}>
          <View style={s.settingRow}>
            <Ionicons name="text-outline" size={20} color={C.gold} />
            <View style={{ flex: 1, gap: 10 }}>
              <Text style={s.noticeTitle}>Text size</Text>
              <View style={s.accessibilityChoices}>
                {(['small','default','large','extra-large'] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: accessibility.textSize === value }}
                    onPress={() => setAccessibility({ ...accessibility, textSize: value })}
                    style={[s.accessibilityChoice, accessibility.textSize === value && s.accessibilityChoiceActive]}
                  >
                    <Text style={s.goldText}>{value === 'extra-large' ? 'Extra large' : value[0].toUpperCase()+value.slice(1)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
          <View style={s.settingRow}>
            <Ionicons name="color-palette-outline" size={20} color={C.gold} />
            <View style={{ flex: 1, gap: 10 }}>
              <Text style={s.noticeTitle}>Theme</Text>
              <View style={s.accessibilityChoices}>
                {(['midnight','high-contrast','sepia'] as const).map((value) => (
                  <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: accessibility.theme === value }} onPress={() => setAccessibility({ ...accessibility, theme: value })} style={[s.accessibilityChoice, accessibility.theme === value && s.accessibilityChoiceActive]}>
                    <Text style={s.goldText}>{value.split('-').map(word=>word[0].toUpperCase()+word.slice(1)).join(' ')}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
          <View style={s.settingRow}>
            <Ionicons name="book-outline" size={20} color={C.gold} />
            <View style={{ flex: 1, gap: 10 }}>
              <Text style={s.noticeTitle}>Font</Text>
              <View style={s.accessibilityChoices}>
                {(['system','serif','readable'] as const).map((value) => (
                  <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: accessibility.font === value }} onPress={() => setAccessibility({ ...accessibility, font: value })} style={[s.accessibilityChoice, accessibility.font === value && s.accessibilityChoiceActive]}>
                    <Text style={s.goldText}>{value[0].toUpperCase()+value.slice(1)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </View>
        <Text style={s.label}>BACKGROUND JOB NOTIFICATIONS</Text>
        <View style={s.settingCard}>
          {notificationToggle(
            "email",
            "Email completion notices",
            "For web users. Sends success and failure notices for world generation and campaign research to the account email.",
            "mail-outline",
          )}
          {notificationToggle(
            "push",
            "Mobile push notifications",
            "For iOS and Android. Sends world-generation and campaign-research results with a route back to the relevant page.",
            "notifications-outline",
          )}
        </View>
        {notificationMessage ? (
          <Text
            style={notificationMessage.includes("saved") ? s.success : s.error}
          >
            {notificationMessage}
          </Text>
        ) : null}
        <Button
          label="Sign out"
          kind="ghost"
          icon="log-out-outline"
          onPress={logout}
        />
        <Button
          label="Delete account"
          kind="danger"
          icon="trash-outline"
          onPress={() => {
            setDeleteError("");
            setPassword("");
            setConfirmDelete(true);
          }}
        />
      </ScrollView>
      <AccountDeleteDialog
        visible={confirmDelete}
        password={password}
        error={deleteError}
        deleting={deleting}
        onPasswordChange={setPassword}
        onCancel={close}
        onConfirm={confirm}
      />
    </>
  );
}

export default function App() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.dataset.sableCrownScrollbars = "true";
    style.textContent = `*{scrollbar-width:thin;scrollbar-color:${C.goldSoft} ${C.coal}}*::-webkit-scrollbar{width:9px;height:9px}*::-webkit-scrollbar-track{background:${C.coal}}*::-webkit-scrollbar-thumb{background:${C.goldSoft};border:1px solid ${C.gold}}*::-webkit-scrollbar-thumb:hover{background:${C.gold}}textarea:focus,input:focus{outline:none!important;box-shadow:none!important}`;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
  const [data, setData] = useState<AppData>(initialData);
  const [accessibility, setAccessibilityState] = useState<AccessibilityPreferences>(defaultAccessibilityPreferences);
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>("auth");
  const [selectedPack, setSelectedPack] = useState<WorldPack>(defaultWorld);
  const [campaignId, setCampaignId] = useState("");
  const [campaignCreateError, setCampaignCreateError] = useState("");
  const [lastCampaignRequest, setLastCampaignRequest] = useState<{
    character: Character;
    campaignName: string;
  } | null>(null);
  const [approvingCampaignCost, setApprovingCampaignCost] = useState(false);
  const passwordRecoveryRef = useRef(hasPasswordRecoveryUrl);
  const appSessionStartedAt = useRef(Date.now());
  const handledBackgroundNotices = useRef(new Set<string>());
  useEffect(() => {
    (async () => {
      try {
        const savedAccessibility = await loadAccessibilityPreferences();
        activeAccessibility = savedAccessibility;
        applyAppTheme(savedAccessibility.theme);
        s = createStyles();
        setAccessibilityState(savedAccessibility);
        const initialUrl = await Linking.getInitialURL();
        const recoveryUrl =
          !!initialUrl && /(?:[?#&])type=recovery(?:[&#]|$)/i.test(initialUrl);
        const notificationResponse =
          Platform.OS === "web"
            ? null
            : await Notifications.getLastNotificationResponseAsync();
        const openWorlds =
          (!!initialUrl && /[?&#]open=worlds(?:[&#]|$)/i.test(initialUrl)) ||
          notificationResponse?.notification.request.content.data?.screen ===
            "packs";
        const linkedCampaignId = initialUrl?.match(/[?&#]campaignId=([^&#]+)/i)?.[1]
          ? decodeURIComponent(initialUrl.match(/[?&#]campaignId=([^&#]+)/i)![1])
          : String(notificationResponse?.notification.request.content.data?.campaignId || "");
        const recoveryPending = await loadPasswordRecoveryPending();
        if (recoveryUrl || passwordRecoveryRef.current) {
          passwordRecoveryRef.current = true;
          await setPasswordRecoveryPending(true);
        } else if (recoveryPending) passwordRecoveryRef.current = true;
        if (passwordRecoveryRef.current) {
          setData(initialData);
          setScreen("reset-password");
          return;
        }
        const d = isSupabaseConfigured
          ? await loadRemoteAppData()
          : await loadData();
        const next = d || initialData;
        setData(next);
        if (next.user && linkedCampaignId && next.campaigns.some((item) => item.id === linkedCampaignId)) {
          setCampaignId(linkedCampaignId);
          setScreen("intel");
        } else setScreen(next.user ? (openWorlds ? "packs" : "home") : "auth");
      } catch (error) {
        if (passwordRecoveryRef.current) {
          setData(initialData);
          setScreen("reset-password");
        } else {
          Alert.alert(
            "Backend connection failed",
            error instanceof Error
              ? error.message
              : "Could not connect to Supabase.",
          );
          setScreen("auth");
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, []);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        if (response.notification.request.content.data?.screen === "packs")
          setScreen("packs");
        if (response.notification.request.content.data?.screen === "intel") {
          const targetCampaign = String(response.notification.request.content.data?.campaignId || "");
          if (targetCampaign) setCampaignId(targetCampaign);
          setScreen("intel");
        }
      },
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        passwordRecoveryRef.current = true;
        void setPasswordRecoveryPending(true);
        setData(initialData);
        setLoaded(true);
        setScreen("reset-password");
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (loaded && !isSupabaseConfigured) saveData(data);
  }, [data, loaded]);
  useEffect(() => {
    if (!loaded || !isSupabaseConfigured || !data.user) return;
    let cancelled = false;
    const checkJobs = async () => {
      try {
        const jobs = (await listRemoteBackgroundJobs()).filter((job) => job.job_type === "context_research");
        if (cancelled) return;
        for (const job of jobs) {
          if (!["completed", "failed"].includes(job.status) || handledBackgroundNotices.current.has(job.id)) continue;
          if (job.status === "completed" && typeof (job.result as any)?.cost !== "number") continue;
          handledBackgroundNotices.current.add(job.id);
          const finishedAt = new Date(job.completed_at || job.updated_at).getTime();
          if (finishedAt < appSessionStartedAt.current) continue;
          const result = job.result as any;
          if (typeof result?.creditsRemaining === "number") setData((current) => ({ ...current, user: current.user ? { ...current.user, creditsRemaining: result.creditsRemaining } : null }));
          const campaignName = data.campaigns.find((item) => item.id === job.payload?.campaignId)?.title || "your campaign";
          if (job.status === "completed") {
            Alert.alert("World research complete", `The requested information has been added to ${campaignName}.`, [
              { text: "Later", style: "cancel" },
              { text: "View ledger", onPress: () => { if (job.payload?.campaignId) setCampaignId(job.payload.campaignId); setScreen("intel"); } },
            ]);
          } else Alert.alert("World research stopped", job.error_message || "The request could not be completed. Its Crown hold was returned.");
        }
      } catch { /* Existing screens surface connection failures without interrupting play. */ }
    };
    void checkJobs();
    const timer = setInterval(() => void checkJobs(), 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [loaded, data.user?.id]);
  const updateAccessibility = (value: AccessibilityPreferences) => {
    activeAccessibility = value;
    applyAppTheme(value.theme);
    s = createStyles();
    setAccessibilityState(value);
    void saveAccessibilityPreferences(value);
  };
  const campaign = data.campaigns.find((c) => c.id === campaignId);
  const pack = campaign
    ? data.packs.find(
        (p) => p.id === campaign.packId && p.version === campaign.packVersion,
      ) || defaultWorld
    : selectedPack;
  const enter = async (
    username: string,
    password: string,
    action: "signin" | "signup",
    email?: string,
  ) => {
    if (isSupabaseConfigured) {
      await authenticateUsername(username, password, action, email);
      const remote = await loadRemoteAppData();
      if (!remote) throw new Error("The account session could not be loaded.");
      setData(remote);
    } else {
      const name = username
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
      setData((d) => ({
        ...d,
        user: { id: uid("user"), name, username, email, creditsRemaining: 100 },
      }));
    }
    setScreen("home");
  };
  const createCampaign = async (character: Character, campaignName: string) => {
    setCampaignCreateError("");
    if (isSupabaseConfigured) {
      setLoaded(false);
      try {
        const id = await createRemoteCampaign(
          selectedPack,
          character,
          campaignName,
        );
        const remote = await loadRemoteAppData();
        if (!remote)
          throw new Error("The campaign was created but could not be loaded.");
        setData(remote);
        setCampaignId(id);
        setScreen("play");
      } catch (error) {
        setCampaignCreateError(
          error instanceof Error ? error.message : "Please try again.",
        );
      } finally {
        setLoaded(true);
      }
      return;
    }
    const opening = selectedPack.openingScenario;
    const startingItem =
      character.background.id === "knight"
        ? "Mail, Sword, and Warhorse"
        : character.background.id === "lord"
          ? "Household Seal and Treasury Key"
          : character.background.id === "serf"
            ? "Work Knife and Mended Cloak"
            : selectedPack.items[0]?.name || "Traveler’s kit";
    const c: Campaign = {
      id: uid("campaign"),
      ownerId: data.user!.id,
      title: campaignName.trim(),
      packId: selectedPack.id,
      packVersion: selectedPack.version,
      character,
      state: {
        locationId: opening?.startLocationId || selectedPack.locations[0].id,
        health: 100,
        resolve: 88,
        inventory: opening?.startingInventory || [
          startingItem,
          "Rain-soaked sealed letter",
        ],
        relationships: opening?.relationships || {},
        memories: opening?.memories || [
          "A badly wounded male courier handed you a sealed letter before collapsing at your feet.",
        ],
        unresolvedThreads: opening?.unresolvedThreads || [
          "Why did the courier choose you?",
        ],
        summary:
          opening?.narration.replaceAll("{name}", character.name) ||
          "The campaign has begun.",
        sceneFacts: opening?.sceneFacts || [],
        ...(opening?.calendar
          ? {
              campaignDate: {
                calendarName: opening.calendar.name,
                year: opening.calendar.year,
                day: opening.calendar.day,
                segment: opening.calendar.segment,
              },
            }
          : {}),
      },
      turns: [],
      currentChapter: 1,
      chapterTitle: opening?.chapterLabel || "Chapter I",
      archived: false,
      updatedAt: new Date().toISOString(),
    };
    setData((d) => ({ ...d, campaigns: [c, ...d.campaigns] }));
    setCampaignId(c.id);
    setScreen("play");
  };
  const updateCampaign = (next: Campaign, charge = 0) =>
    setData((d) => ({
      ...d,
      campaigns: d.campaigns.map((c) => (c.id === next.id ? next : c)),
      user: d.user
        ? {
            ...d.user,
            creditsRemaining: Math.max(0, d.user.creditsRemaining - charge),
          }
        : null,
    }));
  if (!loaded)
    return (
      <View style={s.loading}>
        <ActivityIndicator color={C.gold} />
        <Text style={s.muted}>Opening the chronicle…</Text>
      </View>
    );
  if (screen === "auth") return <Auth onEnter={enter} />;
  if (screen === "reset-password")
    return (
      <ResetPassword
        onComplete={async () => {
          await setPasswordRecoveryPending(false);
          passwordRecoveryRef.current = false;
          setData(initialData);
          setScreen("auth");
          Alert.alert(
            "Password updated",
            "Your password has been changed. Sign in with your username and new password.",
          );
        }}
        onCancel={() => {
          void (async () => {
            if (isSupabaseConfigured) await signOutRemote();
            await setPasswordRecoveryPending(false);
            passwordRecoveryRef.current = false;
            setData(initialData);
            setScreen("auth");
          })();
        }}
      />
    );
  if (screen === "character") {
    const priceMatch = campaignCreateError.match(
      /requires\s+(\d+)\s+Crowns, above your approved maximum of\s+(\d+)/i,
    );
    return (
      <SafeAreaView style={s.root}>
        <CharacterCreate
          pack={selectedPack}
          onBack={() => setScreen("packs")}
          onCreate={(character, campaignName) => {
            setLastCampaignRequest({ character, campaignName });
            return createCampaign(character, campaignName);
          }}
        />
        {priceMatch && lastCampaignRequest ? (
          <CampaignCostApprovalDialog
            required={Number(priceMatch[1])}
            approved={Number(priceMatch[2])}
            busy={approvingCampaignCost}
            onCancel={() => setCampaignCreateError("")}
            onApprove={async () => {
              setApprovingCampaignCost(true);
              try {
                const setup = (
                  lastCampaignRequest.character as Character & {
                    campaignSetup?: CampaignSetupOptions;
                  }
                ).campaignSetup;
                const id = await createRemoteCampaign(
                  selectedPack,
                  lastCampaignRequest.character,
                  lastCampaignRequest.campaignName,
                  setup,
                  Number(priceMatch[1]),
                );
                const remote = await loadRemoteAppData();
                if (!remote)
                  throw new Error(
                    "The campaign was created but could not be loaded.",
                  );
                setData(remote);
                setCampaignId(id);
                setCampaignCreateError("");
                setScreen("play");
              } catch (error) {
                setCampaignCreateError(
                  error instanceof Error
                    ? error.message
                    : "Campaign creation failed.",
                );
              } finally {
                setApprovingCampaignCost(false);
              }
            }}
          />
        ) : (
          <CampaignCreateErrorDialog
            error={campaignCreateError}
            onClose={() => setCampaignCreateError("")}
          />
        )}
      </SafeAreaView>
    );
  }
  if (screen === "play" && campaign)
    return (
      <Play
        campaign={campaign}
        pack={pack}
        crownBalance={data.user?.creditsRemaining || 0}
        updateCampaign={updateCampaign}
        onExit={() => setScreen("home")}
        onOpenIntel={() => setScreen("intel")}
        onOpenStore={() => setScreen("store")}
        onUpdateMetadata={async ({ title }) => {
          let updatedAt = new Date().toISOString();
          if (isSupabaseConfigured) {
            const saved = await updateRemoteCampaignMetadata(campaign.id, {
              title,
            });
            updatedAt = saved.updated_at;
          }
          updateCampaign({ ...campaign, title, updatedAt });
        }}
      />
    );
  if (screen === "intel" && campaign)
    return (
      <WorldIntel
        campaign={campaign}
        pack={pack}
        onBack={() => setScreen("play")}
        onCreditsChanged={(balance) =>
          setData((current) => ({
            ...current,
            user: current.user
              ? { ...current.user, creditsRemaining: balance }
              : current.user,
          }))
        }
      />
    );
  if (screen === "builder")
    return (
      <SafeAreaView style={s.root}>
        <Builder
          userId={data.user!.id}
          onBack={() => setScreen("packs")}
          onSave={(p) => {
            setData((d) => ({ ...d, packs: [...d.packs, p] }));
            setScreen("packs");
          }}
        />
      </SafeAreaView>
    );
  const content =
    screen === "home" ? (
      <Home
        data={data}
        openCampaign={(c) => {
          setCampaignId(c.id);
          setScreen("play");
        }}
        deleteCampaign={async (c) => {
          if (isSupabaseConfigured) await deleteRemoteCampaign(c.id);
          setData((current) => ({
            ...current,
            campaigns: current.campaigns.filter((item) => item.id !== c.id),
          }));
          if (campaignId === c.id) setCampaignId("");
        }}
        openWorlds={() => setScreen("packs")}
        openStore={() => setScreen("store")}
      />
    ) : screen === "store" ? (
      <Store
        balance={data.user?.creditsRemaining || 0}
        onBack={() => setScreen("home")}
        onPurchase={(credits) => {
          setData((d) => ({
            ...d,
            user: d.user
              ? {
                  ...d.user,
                  creditsRemaining: d.user.creditsRemaining + credits,
                }
              : null,
          }));
          Alert.alert(
            "Crowns added",
            `${credits} demonstration Crowns were added to your balance.`,
          );
          setScreen("home");
        }}
      />
    ) : screen === "packs" ? (
      <Packs
        data={data}
        startWorld={(p) => {
          setSelectedPack(p);
          setScreen("character");
        }}
        openBuilder={() => setScreen("builder")}
        importPack={async (p) => {
          if (isSupabaseConfigured) {
            const result = await saveRemoteWorldPack(p);
            setData((d) => ({
              ...d,
              packs: [
                ...d.packs.filter(
                  (x) =>
                    !(
                      x.id === result.pack.id &&
                      x.version === result.pack.version
                    ),
                ),
                result.pack,
              ],
              user: d.user
                ? { ...d.user, creditsRemaining: result.creditsRemaining }
                : null,
            }));
            return { pack: result.pack, cost: result.cost };
          }
          const cost = estimatePackImportCredits(p);
          if (!data.user || data.user.creditsRemaining < cost)
            throw new Error(`You need ${cost} Crowns to import this world.`);
          setData((d) => ({
            ...d,
            packs: [...d.packs, p],
            user: d.user
              ? { ...d.user, creditsRemaining: d.user.creditsRemaining - cost }
              : null,
          }));
          return { pack: p, cost };
        }}
        deleteWorld={async (p) => {
          if (isSupabaseConfigured) await deleteRemoteWorldPack(p);
          setData((d) => ({
            ...d,
            packs: d.packs.filter((world) => world.id !== p.id),
          }));
        }}
      />
    ) : (
      <Settings
        data={data}
        accessibility={accessibility}
        setAccessibility={updateAccessibility}
        logout={async () => {
          if (isSupabaseConfigured) await signOutRemote();
          setData(initialData);
          setScreen("auth");
        }}
        reset={async (password) => {
          if (isSupabaseConfigured) await deleteRemoteAccount(password);
          await clearData();
          setData(initialData);
          setScreen("auth");
        }}
      />
    );
  return (
    <SafeAreaView style={s.root}>
      <View style={s.shell}>
        {content}
        <Nav screen={screen} setScreen={setScreen} />
      </View>
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ink },
  loading: {
    flex: 1,
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.ink,
  },
  shell: { flex: 1 },
  page: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 110,
    gap: 26,
  },
  authWrap: {
    flex: 1,
    width: "100%",
    maxWidth: 500,
    alignSelf: "center",
    padding: 26,
    justifyContent: "center",
    alignItems: "center",
    gap: 13,
  },
  brandMark: {
    width: 54,
    height: 54,
    borderWidth: 1,
    borderColor: C.gold,
    transform: [{ rotate: "45deg" }],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },
  brandRune: {
    color: C.gold,
    fontFamily: Platform.select({ web: "Georgia", default: "serif" }),
    fontSize: 30,
    transform: [{ rotate: "-45deg" }],
  },
  logo: { color: C.gold, letterSpacing: 5, fontSize: 13, fontWeight: "800" },
  authTitle: {
    color: C.white,
    fontFamily: Platform.select({ web: "Georgia", default: "serif" }),
    fontSize: 34,
    textAlign: "center",
    marginTop: 7,
  },
  authCopy: {
    color: C.muted,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 420,
  },
  authCard: {
    width: "100%",
    backgroundColor: "#121718EE",
    borderWidth: 1,
    borderColor: C.line,
    padding: 20,
    gap: 11,
    marginTop: 12,
  },
  authTabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    marginBottom: 5,
  },
  authTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  authTabActive: { borderBottomColor: C.gold },
  authTabText: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  authTabTextActive: { color: C.gold },
  authInputWrap: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
    backgroundColor: C.coal,
    borderWidth: 1,
    borderColor: C.line,
    overflow: "hidden",
  },
  authInputInvalid: { borderColor: C.red },
  authInput: {
    flex: 1,
    minHeight: 48,
    color: C.white,
    fontSize: 15,
    outlineStyle: Platform.OS === "web" ? "none" : undefined,
  } as any,
  webPasswordMasked: { WebkitTextSecurity: "disc" } as any,
  passwordToggle: {
    width: 36,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  authLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  authLink: { color: C.gold, fontSize: 11, fontWeight: "700" },
  authErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#241716",
    padding: 10,
    borderLeftWidth: 2,
    borderLeftColor: C.red,
  },
  fieldError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: -5,
  },
  fieldErrorText: { color: "#E28B84", fontSize: 11 },
  authDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 2,
  },
  authDividerLine: { flex: 1, height: 1, backgroundColor: C.line },
  authDividerText: {
    color: "#737873",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  h1: {
    color: C.white,
    fontFamily: Platform.select({ web: "Georgia", default: "serif" }),
    fontSize: 31,
  },
  h2: {
    color: C.white,
    fontFamily: Platform.select({ web: "Georgia", default: "serif" }),
    fontSize: 26,
  },
  eyebrow: { color: C.gold, letterSpacing: 2, fontWeight: "800", fontSize: 11 },
  copy: { color: C.muted, lineHeight: 21 },
  muted: { color: C.muted, fontSize: 13 },
  label: {
    color: C.muted,
    letterSpacing: 1.5,
    fontWeight: "800",
    fontSize: 10,
  },
  fine: { color: "#777E7D", textAlign: "center", fontSize: 11, lineHeight: 16 },
  fineLeft: { color: "#777E7D", fontSize: 11, lineHeight: 16, marginTop: -4 },
  input: {
    color: C.white,
    backgroundColor: C.coal,
    borderWidth: 1,
    borderColor: C.line,
    minHeight: 48,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 15,
  },
  button: {
    minHeight: 48,
    paddingHorizontal: 17,
    backgroundColor: C.gold,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.line,
  },
  buttonDanger: { backgroundColor: C.red },
  buttonText: { color: C.ink, fontWeight: "900", fontSize: 14 },
  nav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    minHeight: 72,
    paddingBottom: Platform.OS === "ios" ? 12 : 4,
    backgroundColor: "#0D1011F5",
    borderTopWidth: 1,
    borderTopColor: C.line,
    flexDirection: "row",
    justifyContent: "center",
  },
  navItem: { minWidth: 100, padding: 12, alignItems: "center", gap: 5 },
  navText: { color: C.muted, fontSize: 11 },
  topline: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  quota: {
    flexDirection: "row",
    gap: 6,
    borderWidth: 1,
    borderColor: C.goldSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  quotaText: { color: C.gold, fontSize: 12, fontWeight: "700" },
  campaignCard: { borderWidth: 1, borderColor: C.line },
  campaignGlow: { padding: 19, gap: 11 },
  campaignMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  campaignCardActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  deleteCampaignButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#6B3431",
    backgroundColor: "#251716",
  },
  cardTitle: {
    color: C.white,
    fontFamily: Platform.select({ web: "Georgia", default: "serif" }),
    fontSize: 20,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
  },
  goldText: { color: C.gold, fontWeight: "700", fontSize: 13 },
  tag: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: C.goldSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: {
    color: C.gold,
    fontWeight: "800",
    fontSize: 9,
    letterSpacing: 0.8,
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  balanceActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  buyTurns: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    backgroundColor: C.gold,
  },
  buyTurnsText: { color: C.ink, fontSize: 11, fontWeight: "900" },
  storeHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  storeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  turnPack: {
    flexGrow: 1,
    flexBasis: 190,
    minHeight: 280,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
  },
  turnPackFeatured: { borderColor: C.gold, backgroundColor: "#1E1C17" },
  packRibbon: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 6,
    color: C.ink,
    backgroundColor: C.gold,
    textAlign: "center",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  turnCount: {
    color: C.white,
    fontFamily: Platform.select({ web: "Georgia", default: "serif" }),
    fontSize: 43,
    marginTop: 4,
  },
  turnLabel: {
    color: C.gold,
    letterSpacing: 1.5,
    fontWeight: "800",
    fontSize: 10,
  },
  packPrice: {
    color: C.parchment,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 8,
  },
  packBuy: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.goldSoft,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  packBuyText: { color: C.gold, fontSize: 11, fontWeight: "800" },
  worldHero: {
    padding: 22,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    gap: 16,
    justifyContent: "flex-start",
    overflow: "hidden",
  },
  crown: {
    position: "absolute",
    right: 22,
    top: 18,
    width: 68,
    height: 68,
    borderWidth: 1,
    borderColor: C.goldSoft,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.7,
  },
  worldQuote: {
    color: C.white,
    fontFamily: Platform.select({ web: "Georgia", default: "serif" }),
    fontStyle: "italic",
    fontSize: 23,
    maxWidth: "78%",
    lineHeight: 31,
  },
  notice: {
    padding: 16,
    flexDirection: "row",
    gap: 13,
    backgroundColor: C.coal,
    borderLeftWidth: 2,
    borderLeftColor: C.green,
  },
  noticeTitle: { color: C.parchment, fontWeight: "800", marginBottom: 4 },
  back: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 7,
  },
  formCard: {
    padding: 18,
    gap: 14,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  pillActive: { backgroundColor: C.gold, borderColor: C.gold },
  pillText: { color: C.muted, fontWeight: "700" },
  optionGrid: { gap: 8 },
  option: {
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.coal,
    gap: 4,
  },
  optionActive: { borderColor: C.gold, backgroundColor: "#211E17" },
  optionName: { color: C.parchment, fontWeight: "800" },
  optionCopy: { color: C.muted, lineHeight: 18, fontSize: 12 },
  playWrap: { flex: 1, flexDirection: "row", backgroundColor: C.ink },
  side: {
    width: 260,
    backgroundColor: C.coal,
    borderRightWidth: 1,
    borderRightColor: C.line,
    padding: 20,
    gap: 8,
  },
  sideName: {
    color: C.white,
    fontFamily: Platform.select({ web: "Georgia", default: "serif" }),
    fontSize: 24,
  },
  meterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  meter: { height: 3, backgroundColor: C.line },
  meterFill: { height: 3, backgroundColor: C.gold },
  inventory: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingVertical: 5,
  },
  thread: { color: C.muted, lineHeight: 19, fontSize: 12 },
  threadPagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  threadPageButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: C.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  threadPageText: {
    color: C.muted,
    fontSize: 11,
  },
  playMain: { flex: 1, minWidth: 0 },
  playHead: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingHorizontal: 12,
    gap: 8,
  },
  exitStory: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: C.goldSoft,
    backgroundColor: "#181711",
  },
  exitStoryText: { color: C.gold, fontSize: 12, fontWeight: "800" },
  playHeading: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  playTitleEdit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  headerIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  intelHeaderButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: C.goldSoft,
  },
  intelHeaderText: { color: C.gold, fontSize: 11, fontWeight: "800" },
  playTitle: {
    flexShrink: 1,
    color: C.parchment,
    fontFamily: Platform.select({ web: "Georgia", default: "serif" }),
    fontSize: 17,
    textAlign: "center",
  },
  playSub: {
    color: C.gold,
    fontSize: 10,
    letterSpacing: 1,
    textAlign: "center",
    marginTop: 3,
  },
  storyScrollWrap: { flex: 1, position: "relative" },
  storyScroll: { flex: 1 },
  customScrollTrack: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 3,
    width: 7,
    backgroundColor: C.coal,
    borderLeftWidth: 1,
    borderLeftColor: C.line,
  },
  customScrollThumb: {
    position: "absolute",
    left: 1,
    right: 1,
    minHeight: 42,
    backgroundColor: C.goldSoft,
    borderWidth: 1,
    borderColor: C.gold,
  },
  story: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: 22,
    paddingRight: 30,
    gap: 22,
    paddingBottom: 35,
  },
  chapter: {
    textAlign: "center",
    color: C.gold,
    letterSpacing: 2,
    fontSize: 10,
    marginVertical: 8,
  },
  narration: {
    color: C.parchment,
    fontFamily: Platform.select({ web: "Georgia", default: "serif" }),
    fontSize: 18,
    lineHeight: 31,
  },
  playerTurn: {
    borderLeftWidth: 2,
    borderLeftColor: C.gold,
    backgroundColor: C.coal,
    padding: 14,
    gap: 7,
  },
  playerText: { color: C.white, fontStyle: "italic", lineHeight: 21 },
  intentLine: { color: "#7C817F", fontSize: 10 },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  suggestion: {
    borderWidth: 1,
    borderColor: C.goldSoft,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  suggestionText: { color: C.gold, fontSize: 12 },
  loadEarlier: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: C.goldSoft,
    backgroundColor: C.coal,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 10,
  },
  feedbackSubmitted: { opacity: 0.72 },
  feedbackRatingChoices: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  feedbackRatingChoice: {
    width: 90,
    height: 90,
    borderWidth: 1,
    borderColor: C.goldSoft,
    backgroundColor: C.coal,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 12,
  },
  feedbackChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  feedbackChoice: { borderWidth: 1, borderColor: C.goldSoft, paddingHorizontal: 11, paddingVertical: 9 },
  feedbackChoiceActive: { backgroundColor: C.gold, borderColor: C.gold },
  feedbackChoiceTextActive: { color: C.ink, fontWeight: "800" },
  feedbackExplanation: { minHeight: 100, maxHeight: 180, borderWidth: 1, borderColor: C.line, backgroundColor: C.coal, color: C.white, padding: 12, textAlignVertical: "top" },
  thinking: { flexDirection: "row", gap: 10, alignItems: "center" },
  composer: {
    borderTopWidth: 1,
    borderTopColor: C.line,
    padding: 13,
    backgroundColor: C.coal,
    gap: 6,
  },
  composeRow: {
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  composeInputWrap: {
    flex: 1,
    minHeight: 64,
    position: "relative",
    flexDirection: "row",
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.goldSoft,
  },
  composeInput: {
    flex: 1,
    minHeight: 50,
    maxHeight: 50,
    color: C.white,
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    textAlignVertical: "top",
  },
  composeInputDisabled: { opacity: 0.55, backgroundColor: C.coal },
  inputScrollMask: {
    position: "absolute",
    top: 1,
    bottom: 1,
    right: 1,
    width: 16,
    backgroundColor: C.panel,
  },
  inputScrollTrack: {
    position: "absolute",
    top: 1,
    bottom: 1,
    right: 3,
    width: 6,
    backgroundColor: C.coal,
  },
  inputScrollThumb: {
    position: "absolute",
    left: 1,
    right: 1,
    minHeight: 20,
    backgroundColor: C.goldSoft,
    borderWidth: 1,
    borderColor: C.gold,
  },
  send: {
    width: 64,
    height: 64,
    backgroundColor: C.gold,
    borderWidth: 1,
    borderColor: "#D8BB78",
    alignItems: "center",
    justifyContent: "center",
  },
  voiceInput: {
    width: 64,
    height: 64,
    alignSelf: "flex-end",
    borderWidth: 1,
    borderColor: C.goldSoft,
    backgroundColor: C.coal,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceInputActive: { backgroundColor: "#241F14" },
  composerHint: {
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  narrationActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  narrateButton: {
    alignSelf: "flex-start",
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: C.goldSoft,
    backgroundColor: "#181711",
  },
  narrateText: { color: C.gold, fontSize: 11, fontWeight: "800" },
  confirmCheck: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.coal,
  },
  intelSortHead: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  playerIntelRow: {
    backgroundColor: "#201D15",
    borderLeftWidth: 3,
    borderLeftColor: C.gold,
  },
  playerNameLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  playerCharacterBadge: {
    width: 25,
    height: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.gold,
  },
  notApplicable: { color: C.muted, fontSize: 14, fontWeight: "800" },
  intelPage: {
    width: "100%",
    maxWidth: 1050,
    alignSelf: "center",
    padding: 24,
    paddingBottom: 70,
    gap: 23,
  },
  intelTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  intelSeal: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderColor: C.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  intelTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  intelTab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  intelTabActive: { borderBottomColor: C.gold },
  intelTabText: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  intelTable: { borderWidth: 1, borderColor: C.line, backgroundColor: C.panel },
  intelTableHead: {
    flexDirection: "row",
    gap: 14,
    padding: 12,
    backgroundColor: C.coal,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  intelColHead: {
    color: C.gold,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  intelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  intelName: {
    color: C.parchment,
    fontFamily: Platform.select({ web: "Georgia", default: "serif" }),
    fontSize: 17,
  },
  intelValue: { color: C.parchment, fontSize: 12, lineHeight: 18 },
  intelDetail: { color: C.muted, fontSize: 10, lineHeight: 16, marginTop: 3 },
  confidence: {
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderWidth: 1,
  },
  confidenceHigh: { borderColor: C.green, backgroundColor: "#142019" },
  confidenceMedium: { borderColor: C.goldSoft, backgroundColor: "#211E16" },
  confidenceLow: { borderColor: C.red, backgroundColor: "#251817" },
  confidenceText: {
    color: C.parchment,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  intelCards: { gap: 10 },
  intelCard: {
    padding: 16,
    gap: 9,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel,
  },
  resourceLine: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  resourceKnown: {
    marginLeft: "auto",
    color: C.green,
    fontSize: 9,
    fontWeight: "900",
  },
  intelEstimate: { marginLeft: "auto", color: C.gold, fontWeight: "800" },
  dossierGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  dossierFact: {
    flexGrow: 1,
    flexBasis: 210,
    minHeight: 120,
    padding: 16,
    gap: 9,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
  },
  relationshipEvent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 15,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
  },
  relationshipDelta: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  relationshipPositive: { borderColor: C.green, backgroundColor: "#142019" },
  relationshipNegative: { borderColor: C.red, backgroundColor: "#251817" },
  relationshipDeltaText: { color: C.parchment, fontWeight: "900" },
  financeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
    paddingVertical: 8,
  },
  financeBalance: {
    color: C.parchment,
    fontSize: 19,
    fontWeight: "800",
    marginTop: 5,
  },
  financePositive: {
    color: "#89B49B",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
  },
  financeNegative: {
    color: "#E28B84",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
  },
  resourceTransaction: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 9,
  },
  chapterListCard: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    padding: 16,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
  },
  chapterNumber: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.goldSoft,
    backgroundColor: C.coal,
  },
  chapterNumberText: {
    color: C.gold,
    fontFamily: Platform.select({ web: "Georgia", default: "serif" }),
    fontSize: 20,
    fontWeight: "800",
  },
  chapterSummaryCard: {
    padding: 22,
    gap: 12,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.goldSoft,
  },
  chapterSummaryText: {
    color: C.parchment,
    fontFamily: Platform.select({ web: "Georgia", default: "serif" }),
    fontSize: 18,
    lineHeight: 29,
  },
  emptyStoriesPage: { flexGrow: 1 },
  emptyStoriesStage: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-start",
    paddingTop: 28,
  },
  emptyStories: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    alignItems: "center",
    gap: 12,
    padding: 32,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
  },
  emptyStoriesIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.coal,
    borderWidth: 1,
    borderColor: C.goldSoft,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  packCard: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    padding: 16,
    flexDirection: "row",
    gap: 14,
  },
  packIcon: {
    width: 52,
    height: 52,
    backgroundColor: C.coal,
    borderWidth: 1,
    borderColor: C.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  templateBox: {
    flexDirection: "row",
    gap: 13,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.goldSoft,
    padding: 17,
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 4,
  },
  pageButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: C.goldSoft,
    backgroundColor: C.coal,
  },
  error: { color: "#E28B84", fontSize: 12 },
  success: { color: "#89B49B", fontSize: 12 },
  settingCard: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
  },
  settingRow: {
    padding: 17,
    flexDirection: "row",
    gap: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  accessibilityChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  accessibilityChoice: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.coal,
  },
  accessibilityChoiceActive: {
    borderColor: C.gold,
    backgroundColor: C.raised,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "#000000D8",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.goldSoft,
    padding: 24,
    alignItems: "center",
    gap: 13,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  storyErrorCard: { maxWidth: 500, borderColor: C.red, borderTopWidth: 3 },
  modalIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: C.goldSoft,
    backgroundColor: C.coal,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    color: C.white,
    fontFamily: Platform.select({ web: "Georgia", default: "serif" }),
    fontSize: 24,
    textAlign: "center",
  },
  modalBody: { color: C.muted, lineHeight: 21, textAlign: "center" },
  modalActions: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    gap: 9,
    marginTop: 5,
    flexWrap: "wrap",
  },
  errorAssurance: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 11,
    backgroundColor: "#142019",
    borderWidth: 1,
    borderColor: C.green,
  },
  errorAssuranceText: {
    color: "#A9C9B5",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  errorReference: {
    color: "#747A78",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  recoverySuccessIcon: { borderColor: C.green, backgroundColor: "#142019" },
  recoverySuccess: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 14,
    backgroundColor: "#142019",
    borderWidth: 1,
    borderColor: C.green,
  },
  recoverySuccessText: {
    flex: 1,
    color: "#A9C9B5",
    lineHeight: 20,
    textAlign: "center",
    fontWeight: "700",
  },
  importInfoBar: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    padding: 14,
    backgroundColor: "#211E17",
    borderLeftWidth: 3,
    borderLeftColor: C.gold,
  },
  importInfoText: { color: C.parchment, fontSize: 12, lineHeight: 19 },
  importInfoFine: { color: C.muted, fontSize: 10, lineHeight: 16 },
  conflictCard: { maxWidth: 680, maxHeight: "94%" },
  conflictScrollWrap: { width: "100%", maxHeight: 330, position: "relative" },
  conflictList: { width: "100%" },
  conflictListContent: { gap: 9, paddingRight: 12 },
  conflictScrollTrack: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 2,
    width: 7,
    backgroundColor: C.coal,
    borderLeftWidth: 1,
    borderLeftColor: C.line,
  },
  conflictScrollThumb: {
    position: "absolute",
    left: 1,
    right: 1,
    minHeight: 34,
    backgroundColor: C.goldSoft,
    borderWidth: 1,
    borderColor: C.gold,
  },
  conflictEntry: {
    padding: 14,
    gap: 5,
    backgroundColor: C.coal,
    borderWidth: 1,
    borderColor: C.line,
  },
  conflictId: {
    color: C.gold,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  conflictActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 5,
  },
  differentPlacesChoice: {
    width: "100%",
    gap: 7,
    padding: 14,
    backgroundColor: "#211E17",
    borderWidth: 1,
    borderColor: C.goldSoft,
  },
  customNameField: { gap: 4, marginTop: 3 },
  conflictPreview: { color: C.parchment, fontSize: 12, lineHeight: 18 },
  conflictDivider: {
    color: C.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
    textAlign: "center",
    marginTop: 3,
  },
  campaignEnded: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.red,
    backgroundColor: "#211515",
  },
});
let s = createStyles();
