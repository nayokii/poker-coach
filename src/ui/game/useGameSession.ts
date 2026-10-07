import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SimpleBot, botRoster, chooseBotAction, type DecisionProvider, type RosterEntry } from '../../ai';
import {
  applyAction, createGame, getLegalActions, isHandOver, seededRng, startHand,
  type Card, type GameState, type LegalActions, type PlayerAction, type Rng,
} from '../../engine';
import { clearSession, saveSession, type SavedSession, type Settings } from '../../storage';

export const HERO = 0;

export type SessionPhase = 'playing' | 'result' | 'over';

export interface SessionOptions {
  settings: Settings;
  /** Resume from a saved snapshot instead of starting fresh. */
  resume?: SavedSession | null;
  /** Deterministic seed (tests). Defaults to a random one from crypto. */
  seed?: number;
  /** Multiplier applied to every pacing delay (0 = instant, used by tests). */
  paceScale?: number;
  provider?: DecisionProvider;
}

export interface Session {
  game: GameState;
  phase: SessionPhase;
  /** Board cards currently displayed (lags behind the engine during a run-out). */
  board: Card[];
  /** The hand is over and everything has been revealed. */
  settled: boolean;
  /** Seat index of the bot that is deciding, or null. */
  thinking: number | null;
  heroLegal: LegalActions | null;
  handsPlayed: number;
  startStack: number;
  /** Hero chips now minus hero chips at the start of the session. */
  sessionNet: number;
  act: (action: PlayerAction) => void;
  nextHand: () => void;
  /** Seat -> bot profile id ("tag", "nit"...), used only to pick a hypothetical range for the coach. */
  botProfiles: Record<number, string>;
  /** Why the session ended, when phase is "over". */
  overReason: 'busted' | 'cleared' | null;
}

const visibleBoard = (game: GameState, shown: number): Card[] => game.board.slice(0, shown);

function randomSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] as number;
}

const PACE = { relaxed: 1.45, normal: 1, fast: 0.55 } as const;

/** Next number of board cards to reveal: flop together, then one card at a time. */
const nextReveal = (shown: number, target: number): number => (shown === 0 ? Math.min(3, target) : shown + 1);

function buildGame(opts: SessionOptions, roster: RosterEntry[]): GameState {
  const { settings, resume } = opts;
  if (resume) {
    return createGame({
      players: resume.players,
      smallBlind: resume.bigBlind / 2,
      bigBlind: resume.bigBlind,
      button: resume.button,
    });
  }
  const stack = settings.stackBB * settings.bigBlind;
  return createGame({
    players: [
      { id: 'hero', name: settings.playerName, stack },
      ...roster.map((b, i) => ({ id: `bot${i + 1}`, name: b.name, stack })),
    ],
    smallBlind: settings.bigBlind / 2,
    bigBlind: settings.bigBlind,
  });
}

/**
 * Drives a session: starts hands, plays bot turns through the DecisionProvider, paces board
 * reveals and detects the end of the hand / session. All poker logic stays in the engine.
 */
export function useGameSession(opts: SessionOptions): Session {
  const { settings, resume } = opts;
  const scale = opts.paceScale ?? PACE[settings.botSpeed];
  const roster = useMemo(() => botRoster(settings.bots), [settings.bots]);

  const rng = useRef<Rng>(seededRng(opts.seed ?? randomSeed()));
  const uiRng = useRef<Rng>(seededRng((opts.seed ?? randomSeed()) ^ 0x9e3779b9));
  const provider = useMemo<DecisionProvider>(
    () =>
      opts.provider ??
      new SimpleBot((i) => roster[i - 1]?.profile ?? (roster[0] as RosterEntry).profile),
    [opts.provider, roster],
  );

  const startStack = resume?.startStack ?? settings.stackBB * settings.bigBlind;
  const [game, setGame] = useState<GameState>(() => startHand(buildGame(opts, roster), rng.current));
  const [shown, setShown] = useState(0);
  // Hands finished before the current one (the current one counts once it is settled).
  const [completed, setCompleted] = useState(resume?.handsPlayed ?? 0);
  const [thinking, setThinking] = useState<number | null>(null);

  const over = isHandOver(game);
  const settled = over && shown >= game.board.length;

  // Board reveal pacing (street changes and all-in run-outs).
  useEffect(() => {
    if (shown >= game.board.length) return;
    const delay = (shown === 0 ? 380 : 900) * scale;
    const t = setTimeout(() => setShown((s) => nextReveal(s, game.board.length)), delay);
    return () => clearTimeout(t);
  }, [shown, game.board.length, scale]);

  // Bot turns.
  const toAct = game.toAct;
  const boardReady = shown >= game.board.length;
  useEffect(() => {
    if (game.handStatus !== 'inProgress' || toAct === null || toAct === HERO || !boardReady) {
      setThinking(null);
      return;
    }
    setThinking(toAct);
    let cancelled = false;
    const delay = (650 + uiRng.current() * 700) * scale;
    const t = setTimeout(() => {
      void chooseBotAction(game, provider, rng.current).then((action) => {
        if (cancelled) return;
        setGame((g) => (g === game ? applyAction(g, action) : g));
      });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [game, toAct, boardReady, provider, scale]);

  const handsPlayed = completed + (settled ? 1 : 0);

  const heroStack = game.players[HERO]?.stack ?? 0;
  const botsAlive = game.players.some((p, i) => i !== HERO && p.stack > 0);
  const overReason: Session['overReason'] = !settled ? null : heroStack <= 0 ? 'busted' : !botsAlive ? 'cleared' : null;

  useEffect(() => {
    if (!settled) return;
    if (overReason) {
      clearSession();
      return;
    }
    saveSession({
      version: 1,
      players: game.players.map((p) => ({ id: p.id, name: p.name, stack: p.stack })),
      bigBlind: game.config.bigBlind,
      button: game.button,
      handsPlayed,
      startStack,
    });
  }, [settled, overReason, game, handsPlayed, startStack]);

  const act = useCallback(
    (action: PlayerAction) => {
      setGame((g) => (g.toAct === HERO && g.handStatus === 'inProgress' ? applyAction(g, action) : g));
    },
    [],
  );

  const nextHand = useCallback(() => {
    if (!isHandOver(game)) return;
    setCompleted((c) => c + 1);
    setGame(startHand(game, rng.current));
    setShown(0);
  }, [game]);

  const botProfiles = useMemo(() => {
    const out: Record<number, string> = {};
    game.players.forEach((_, i) => {
      if (i === HERO) return;
      const entry = roster[i - 1] ?? roster[0];
      if (entry) out[i] = entry.profile.id;
    });
    return out;
  }, [game.players.length, roster]);

  const heroLegal = useMemo(
    () => (game.toAct === HERO && boardReady ? getLegalActions(game) : null),
    [game, boardReady],
  );

  return {
    game,
    phase: overReason ? 'over' : settled ? 'result' : 'playing',
    board: visibleBoard(game, shown),
    settled,
    thinking,
    heroLegal,
    handsPlayed,
    startStack,
    sessionNet: heroStack - startStack,
    act,
    nextHand,
    overReason,
    botProfiles,
  };
}
