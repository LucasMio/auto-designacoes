// Tudo relacionado a datas e horários, sempre no fuso de Cuiabá (Mato Grosso, UTC-4).
import { DateTime, Settings } from 'luxon';

export const FUSO = 'America/Cuiaba';
Settings.defaultZone = FUSO;
Settings.defaultLocale = 'pt-BR';

const DIAS_DA_SEMANA = [null, 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];

export function agora() {
  return DateTime.now().setZone(FUSO);
}

/** Converte "HH:mm" em { hour, minute }. */
export function partesHorario(horario) {
  const [hour, minute] = horario.split(':').map(Number);
  return { hour, minute };
}

/** Momento exato em que a reunião começa. data = "AAAA-MM-DD", horario = "HH:mm". */
export function momentoReuniao(data, horario) {
  return DateTime.fromISO(data, { zone: FUSO }).set({ ...partesHorario(horario), second: 0, millisecond: 0 });
}

/** Formato gravado no banco: ISO em UTC, que pode ser comparado como texto. */
export function paraBanco(dt) {
  return dt.toUTC().toISO();
}

export function doBanco(iso) {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(FUSO);
}

/** "2026-10-14" -> "14/10/2026" */
export function formatarData(data) {
  return DateTime.fromISO(data, { zone: FUSO }).toFormat('dd/MM/yyyy');
}

/** "2026-10-14" -> "Terça-feira" */
export function diaDaSemana(data) {
  return DIAS_DA_SEMANA[DateTime.fromISO(data, { zone: FUSO }).weekday];
}

/** Data e hora legíveis: "14/10/2026 08:00" */
export function formatarMomento(dt) {
  return dt.setZone(FUSO).toFormat('dd/MM/yyyy HH:mm');
}

/** Texto relativo: "hoje", "amanhã", "daqui a 7 dias". */
export function descreverQuando(data, referencia) {
  const dia = DateTime.fromISO(data, { zone: FUSO }).startOf('day');
  const hoje = referencia.setZone(FUSO).startOf('day');
  const dias = Math.round(dia.diff(hoje, 'days').days);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  return `daqui a ${dias} dias`;
}

/** true se "agora" está entre o início e o fim da janela de envio. */
export function dentroDaJanela(momento, janela) {
  const minutos = momento.setZone(FUSO).hour * 60 + momento.setZone(FUSO).minute;
  const ini = partesHorario(janela.inicio);
  const fim = partesHorario(janela.fim);
  return minutos >= ini.hour * 60 + ini.minute && minutos < fim.hour * 60 + fim.minute;
}

/** Aceita "19:30", "19h30", "19h", "7:30", "19.30" e devolve "HH:mm" (ou null). */
export function normalizarHorario(texto) {
  const m = String(texto ?? '').trim().match(/^(\d{1,2})\s*(?:[:hH.]\s*(\d{2})?)?\s*(?:h|hs|min)?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Lê uma data (e hora opcional) digitada pelo usuário, ex.: "07/10/2026 08:00".
 * Devolve DateTime ou null.
 */
export function lerMomentoDigitado(texto) {
  const m = String(texto ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}))?$/);
  if (!m) return null;
  const horario = m[4] ? normalizarHorario(m[4]) : '08:00';
  const dt = DateTime.fromObject(
    { year: Number(m[3]), month: Number(m[2]), day: Number(m[1]), ...partesHorario(horario) },
    { zone: FUSO },
  );
  return dt.isValid ? dt : null;
}
