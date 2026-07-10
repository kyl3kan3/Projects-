// MEDS — the HRT regimen engine + labs. Add/edit meds, change doses (timeline events), adherence.
import React, { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon } from '@/components/icons';
import { Button, Card, Chip, Hairline, Screen, Txt } from '@/components/ui';
import { rescheduleAll } from '@/lib/notifications';
import { checkGate } from '@/lib/paywall';
import {
  doseLog, isoToLocalDay, labs, meds, todayIso,
  type LabResult, type MedKind, type Medication, type Regimen, type Schedule,
} from '@/lib/repositories';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const KINDS: MedKind[] = ['patch', 'gel', 'spray', 'tablet', 'vaginal', 'supplement'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface MedView { med: Medication; regimen: Regimen; week: ('t' | 's' | null)[]; changedFrom: string | null }

export default function Meds() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [list, setList] = useState<MedView[]>([]);
  const [labList, setLabList] = useState<LabResult[]>([]);
  const [editor, setEditor] = useState<{ mode: 'add' } | { mode: 'change'; med: Medication } | null>(null);
  const [labEditor, setLabEditor] = useState(false);

  const reload = useCallback(() => {
    setList(
      meds.active().flatMap((med) => {
        const regimen = meds.currentRegimen(med.id);
        if (!regimen) return [];
        const history = meds.regimenHistory(med.id);
        const prev = history.length > 1 ? history[history.length - 2] : null;
        const logs = doseLog.forRegimen(regimen.id, 30);
        const week: ('t' | 's' | null)[] = [];
        for (let i = 6; i >= 0; i--) {
          const day = shift(todayIso(), -i);
          const log = logs.find((l) => isoToLocalDay(l.loggedAt) === day);
          week.push(log ? (log.status === 'taken' ? 't' : 's') : null);
        }
        return [{ med, regimen, week, changedFrom: prev ? `Changed from ${prev.dose} on ${regimen.startDate}` : null }];
      }),
    );
    setLabList(labs.all().slice(0, 8));
  }, []);

  useFocusEffect(useCallback(() => reload(), [reload]));

  const onAdd = () => {
    if (checkGate('med-2') !== null) { router.push('/paywall'); return; }
    setEditor({ mode: 'add' });
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + space.l, paddingBottom: space.xxl, gap: space.l }}>
        <Txt role="h2">Medications</Txt>
        {list.map((v) => <MedCard key={v.med.id} view={v} onChangeDose={() => setEditor({ mode: 'change', med: v.med })} />)}
        {list.length === 0 && (
          <Card style={{ padding: space.l }}>
            <Txt role="body" color="ink2">No medications yet. Add your HRT (or anything else you take) and MenoCompass will remind you, log adherence, and mark every dose change on your charts.</Txt>
          </Card>
        )}
        <Button kind="secondary" label="Add a medication" onPress={onAdd} />

        <View style={{ gap: space.s }}>
          <Txt role="label" color="ink2">Labs</Txt>
          <Card style={{ paddingHorizontal: space.m }}>
            {labList.map((l, i) => (
              <View key={l.id}>
                {i > 0 && <Hairline />}
                <LabRow lab={l} />
              </View>
            ))}
            {labList.length === 0 && (
              <View style={{ padding: space.m }}>
                <Txt role="secondary" color="ink2">No labs yet. When you get bloodwork, log it here and it will chart beside your symptoms.</Txt>
              </View>
            )}
          </Card>
          <Button kind="quiet" label="Add result" onPress={() => setLabEditor(true)} />
        </View>
      </ScrollView>

      {editor && <MedEditor state={editor} onDone={() => { setEditor(null); reload(); void rescheduleAll(); }} />}
      {labEditor && <LabEditor onDone={() => { setLabEditor(false); reload(); }} />}
    </Screen>
  );
}

function MedCard({ view, onChangeDose }: { view: MedView; onChangeDose: () => void }) {
  const p = useTheme();
  const s = view.regimen.schedule;
  const line =
    s.type === 'twice_weekly' ? `${view.med.kind} · ${s.days.join(' & ')} · ${s.time}` :
    s.type === 'weekly' ? `${view.med.kind} · ${s.day}s · ${s.time}` :
    s.type === 'cyclical' ? `${view.med.kind} · ${s.daysOn} on / ${s.daysOff} off` :
    `${view.med.kind} · daily · ${s.time}`;
  return (
    <Card style={{ padding: space.l, gap: space.m }}>
      <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
        <Icon name={view.med.kind === 'patch' ? 'patch' : 'pill'} size={20} color={p.ink2} />
        <View style={{ flex: 1 }}>
          <Txt role="title">{view.med.name} {view.regimen.dose}</Txt>
          <Txt role="secondary" color="ink2">{line}</Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {view.week.map((w, i) => (
          <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: w === 't' ? p.sage : w === 's' ? p.claret : p.hairline }} />
        ))}
      </View>
      <Hairline />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt role="secondary" color="ink2">{view.changedFrom ?? `Started ${view.regimen.startDate}`}</Txt>
        <Button kind="quiet" label="Change dose" onPress={onChangeDose} />
      </View>
    </Card>
  );
}

function LabRow({ lab }: { lab: LabResult }) {
  const p = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m }}>
      <Icon name="vial" size={20} color={p.ink2} />
      <View style={{ flex: 1 }}>
        <Txt role="title">{lab.panel}</Txt>
        <Txt role="secondary" color="ink2">{lab.date}</Txt>
      </View>
      <Txt role="data" color="ink2">{lab.value} {lab.unit}</Txt>
    </View>
  );
}

const SCHEDULE_KINDS: { key: Schedule['type']; label: string }[] = [
  { key: 'daily', label: 'daily' },
  { key: 'twice_weekly', label: 'twice weekly' },
  { key: 'weekly', label: 'weekly' },
  { key: 'cyclical', label: 'days on / off' },
];

/** One sheet for both add-medication and change-dose. Editing a dose seeds every
 *  field from the CURRENT regimen — a dose change must never silently move reminders. */
function MedEditor({ state, onDone }: { state: { mode: 'add' } | { mode: 'change'; med: Medication }; onDone: () => void }) {
  const changing = state.mode === 'change';
  const current = changing ? meds.currentRegimen(state.med.id) : null;
  const cs = current?.schedule ?? null;
  const [name, setName] = useState(changing ? state.med.name : '');
  const [kind, setKind] = useState<MedKind>(changing ? state.med.kind : 'patch');
  const [dose, setDose] = useState(current?.dose ?? '');
  const [scheduleKind, setScheduleKind] = useState<Schedule['type']>(cs?.type ?? 'twice_weekly');
  const [days, setDays] = useState<string[]>(
    cs?.type === 'twice_weekly' ? [...cs.days] : cs?.type === 'weekly' ? [cs.day] : ['Mon', 'Thu'],
  );
  const [time, setTime] = useState(cs && 'time' in cs ? cs.time : '08:00');
  const [daysOn, setDaysOn] = useState(cs?.type === 'cyclical' ? String(cs.daysOn) : '14');
  const [daysOff, setDaysOff] = useState(cs?.type === 'cyclical' ? String(cs.daysOff) : '14');

  const toggleDay = (d: string) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const buildSchedule = (): Schedule => {
    const t = /^\d{1,2}:\d{2}$/.test(time.trim()) ? time.trim() : '08:00';
    const picked = [...new Set(days)];
    switch (scheduleKind) {
      case 'twice_weekly':
        return picked.length >= 2
          ? { type: 'twice_weekly', days: [picked[0], picked[1]], time: t }
          : { type: 'weekly', day: picked[0] ?? 'Mon', time: t };
      case 'weekly':
        return { type: 'weekly', day: picked[0] ?? 'Mon', time: t };
      case 'cyclical':
        return { type: 'cyclical', daysOn: clampInt(daysOn, 14), daysOff: clampInt(daysOff, 14), time: t };
      default:
        return { type: 'daily', time: t };
    }
  };

  const save = () => {
    const schedule = buildSchedule();
    if (changing) meds.changeDose(state.med.id, dose.trim() || current?.dose || 'dose updated', schedule);
    else if (name.trim()) meds.add(name.trim(), kind, true, dose.trim() || '—', schedule);
    onDone();
  };

  return (
    <Sheet title={changing ? `Change ${state.med.name}` : 'Add a medication'} onClose={onDone}>
      {!changing && (
        <>
          <Field label="Name" value={name} onChange={setName} placeholder="Estradot" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {KINDS.map((k) => <Chip key={k} label={k} active={kind === k} onPress={() => setKind(k)} />)}
          </View>
        </>
      )}
      <Field label={changing ? 'New dose' : 'Dose'} value={dose} onChange={setDose} placeholder="50µg" />
      <View style={{ gap: space.xs }}>
        <Txt role="label" color="ink2">Schedule</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          {SCHEDULE_KINDS.map((k) => (
            <Chip key={k.key} label={k.label} active={scheduleKind === k.key} onPress={() => setScheduleKind(k.key)} />
          ))}
        </View>
      </View>
      {(scheduleKind === 'twice_weekly' || scheduleKind === 'weekly') && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          {DAYS.map((d) => <Chip key={d} label={d} active={days.includes(d)} onPress={() => toggleDay(d)} />)}
        </View>
      )}
      {scheduleKind === 'cyclical' && (
        <View style={{ flexDirection: 'row', gap: space.s }}>
          <View style={{ flex: 1 }}><Field label="Days on" value={daysOn} onChange={setDaysOn} placeholder="14" keyboard="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Days off" value={daysOff} onChange={setDaysOff} placeholder="14" keyboard="decimal-pad" /></View>
        </View>
      )}
      <Field label="Reminder time (HH:MM)" value={time} onChange={setTime} placeholder="08:00" />
      {changing && <Txt role="secondary" color="ink2">This becomes a dated marker on every chart, so you can see what changed and when. Your reminder days and time stay as they are unless you change them here.</Txt>}
      <Button label={changing ? 'Log dose change' : 'Add medication'} onPress={save} />
    </Sheet>
  );
}

function clampInt(v: string, fallback: number): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 && n <= 60 ? n : fallback;
}

function LabEditor({ onDone }: { onDone: () => void }) {
  const [panel, setPanel] = useState('Estradiol');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('pmol/L');
  const [date, setDate] = useState(todayIso());
  return (
    <Sheet title="Add a lab result" onClose={onDone}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {['Estradiol', 'FSH', 'TSH', 'Testosterone', 'Vitamin D'].map((x) => (
          <Chip key={x} label={x} active={panel === x} onPress={() => setPanel(x)} />
        ))}
      </View>
      <Field label="Value" value={value} onChange={setValue} placeholder="312" keyboard="decimal-pad" />
      <Field label="Unit" value={unit} onChange={setUnit} placeholder="pmol/L" />
      <Field label="Draw date (YYYY-MM-DD)" value={date} onChange={setDate} placeholder={todayIso()} />
      <Button label="Save result" onPress={() => {
        const v = parseFloat(value);
        const d = /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) ? date.trim() : todayIso();
        if (!Number.isNaN(v)) labs.add(d, panel, v, unit);
        onDone();
      }} />
    </Sheet>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const p = useTheme();
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose} />
      <View style={{ backgroundColor: p.paper, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: space.gutter, paddingBottom: space.xxl, gap: space.l }}>
        <Txt role="h2">{title}</Txt>
        {children}
      </View>
    </Modal>
  );
}

function Field({ label, value, onChange, placeholder, keyboard }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
  keyboard?: 'decimal-pad';
}) {
  const p = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Txt role="label" color="ink2">{label}</Txt>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={p.ink3}
        keyboardType={keyboard}
        style={{
          height: 48, borderWidth: 1, borderColor: p.hairline, borderRadius: radius.control,
          paddingHorizontal: space.m, color: p.ink, fontSize: 16, backgroundColor: p.card,
        }}
      />
    </View>
  );
}

function shift(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
