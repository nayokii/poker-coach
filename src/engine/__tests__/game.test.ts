import { describe, expect, it } from 'vitest';
import {
  IllegalActionError, applyAction, cardToString, createGame, getLegalActions, getResult, isHandOver,
  positionLabels, seededRng, startHand,
} from '..';
import { assertConsistent, newGame, play, rigged } from './helpers';

const START = 1000;
const three = () => newGame([START, START, START]);
const total3 = 3 * START;

describe('createGame / startHand', () => {
  it('rejects invalid setups', () => {
    expect(() => newGame([100])).toThrow();
    expect(() => createGame({ players: [{ id: 'a', name: 'a', stack: 10 }, { id: 'a', name: 'b', stack: 10 }], smallBlind: 1, bigBlind: 2 })).toThrow();
    expect(() => createGame({ players: [{ id: 'a', name: 'a', stack: 10 }, { id: 'b', name: 'b', stack: 10 }], smallBlind: 5, bigBlind: 2 })).toThrow();
  });

  it('deals 2 unique private cards per player and posts blinds (3-handed)', () => {
    const s = startHand(three(), seededRng(1));
    expect(s.handStatus).toBe('inProgress');
    expect(s.street).toBe('preflop');
    expect(s.board).toEqual([]);
    const cards = s.players.flatMap((p) => p.holeCards).map(cardToString);
    expect(cards).toHaveLength(6);
    expect(new Set(cards).size).toBe(6);
    expect(s.deck).toHaveLength(46);
    expect(s.players.map((p) => p.position)).toEqual(['BTN', 'SB', 'BB']);
    expect([s.smallBlindIndex, s.bigBlindIndex]).toEqual([1, 2]);
    expect(s.players.map((p) => p.bet)).toEqual([0, 5, 10]);
    expect(s.players.map((p) => p.stack)).toEqual([START, START - 5, START - 10]);
    expect(s.pot).toBe(15);
    expect(s.currentBet).toBe(10);
    expect(s.toAct).toBe(0); // UTG = button when 3-handed
    expect(s.history.map((h) => [h.type, h.amount])).toEqual([['postSmallBlind', 5], ['postBigBlind', 10]]);
    assertConsistent(s, total3);
  });

  it('is fully reproducible with the same seed', () => {
    const a = startHand(three(), seededRng(77));
    const b = startHand(three(), seededRng(77));
    const c = startHand(three(), seededRng(78));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('does not mutate the input state', () => {
    const g = three();
    const snapshot = structuredClone(g);
    const s = startHand(g, seededRng(1));
    applyAction(s, { type: 'fold' });
    expect(g).toEqual(snapshot);
  });

  it('moves the button every hand', () => {
    let s = startHand(three(), seededRng(1));
    expect(s.button).toBe(0);
    s = play(s, ['fold'], ['fold']);
    expect(isHandOver(s)).toBe(true);
    s = startHand(s, seededRng(2));
    expect([s.button, s.smallBlindIndex, s.bigBlindIndex, s.toAct]).toEqual([1, 2, 0, 1]);
    s = play(s, ['fold'], ['fold']);
    s = startHand(s, seededRng(3));
    expect([s.button, s.smallBlindIndex, s.bigBlindIndex, s.toAct]).toEqual([2, 0, 1, 2]);
  });

  it('refuses to start a hand while one is in progress', () => {
    expect(() => startHand(startHand(three(), seededRng(1)), seededRng(1))).toThrow();
  });

  it('labels positions for several table sizes', () => {
    expect(positionLabels(2)).toEqual(['BTN', 'BB']);
    expect(positionLabels(4)).toEqual(['BTN', 'SB', 'BB', 'UTG']);
    expect(positionLabels(6)).toEqual(['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO']);
    expect(positionLabels(9)).toEqual(['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'HJ', 'CO']);
  });

  it('sits out players without chips and skips them for the button', () => {
    const g = newGame([1000, 0, 1000, 1000], { button: 0 });
    let s = startHand(g, seededRng(1));
    expect(s.players[1]!.status).toBe('out');
    expect(s.players[1]!.holeCards).toEqual([]);
    expect([s.smallBlindIndex, s.bigBlindIndex]).toEqual([2, 3]);
    expect(s.toAct).toBe(0);
    s = play(s, ['fold'], ['fold']);
    s = startHand(s, seededRng(2));
    expect(s.button).toBe(2);
    assertConsistent(s, 3000);
  });
});

describe('heads-up', () => {
  const hu = () => newGame([1000, 1000]);

  it('button is the small blind and acts first preflop; big blind acts first postflop', () => {
    let s = startHand(hu(), seededRng(1));
    expect([s.button, s.smallBlindIndex, s.bigBlindIndex]).toEqual([0, 0, 1]);
    expect(s.players.map((p) => p.position)).toEqual(['BTN', 'BB']);
    expect(s.players.map((p) => p.bet)).toEqual([5, 10]);
    expect(s.toAct).toBe(0);
    s = play(s, ['call']); // SB completes
    expect(s.street).toBe('preflop');
    expect(s.toAct).toBe(1); // BB option
    const legal = getLegalActions(s)!;
    expect(legal.check).toBe(true);
    expect(legal.raise).toBe(true);
    s = play(s, ['check']);
    expect(s.street).toBe('flop');
    expect(s.board).toHaveLength(3);
    expect(s.toAct).toBe(1);
    s = play(s, ['check'], ['check']);
    expect(s.street).toBe('turn');
    expect(s.toAct).toBe(1);
    s = play(s, ['check'], ['check']);
    expect(s.street).toBe('river');
    expect(s.board).toHaveLength(5);
    s = play(s, ['check'], ['check']);
    expect(isHandOver(s)).toBe(true);
    expect(s.street).toBe('showdown');
    assertConsistent(s, 2000);
  });

  it('alternates the button on the next hand', () => {
    let s = startHand(hu(), seededRng(1));
    s = play(s, ['fold']);
    s = startHand(s, seededRng(2));
    expect([s.button, s.smallBlindIndex, s.bigBlindIndex, s.toAct]).toEqual([1, 1, 0, 1]);
  });

  it('big blind wins when the small blind folds', () => {
    let s = startHand(hu(), seededRng(1));
    s = play(s, ['fold']);
    expect(s.players.map((p) => p.stack)).toEqual([995, 1005]);
    expect(getResult(s)!.endedBy).toBe('fold');
  });

  it('refunds an uncalled raise', () => {
    let s = rigged(hu(), ['As Ah', 'Kd Kc'], '2h 7d 9s Jc 3d');
    s = play(s, ['raise', 100], ['fold']);
    const r = getResult(s)!;
    expect(r.refunds).toEqual([{ player: 0, amount: 90 }]);
    expect(r.pots).toHaveLength(1);
    expect(r.pots[0]!.amount).toBe(20);
    expect(s.players.map((p) => p.stack)).toEqual([1010, 990]);
    assertConsistent(s, 2000);
  });
});

describe('legal actions', () => {
  it('exposes the available options with amounts', () => {
    const s = startHand(three(), seededRng(1));
    expect(getLegalActions(s)).toEqual({
      player: 0, toCall: 10, fold: true, check: false, call: true, callAmount: 10,
      bet: false, raise: true, minRaiseTo: 20, maxRaiseTo: 1000, allIn: true,
    });
  });

  it('offers the big blind its option, then bet rather than raise postflop', () => {
    let s = startHand(three(), seededRng(1));
    s = play(s, ['call'], ['call']);
    const bb = getLegalActions(s)!;
    expect([bb.player, bb.check, bb.call, bb.raise, bb.minRaiseTo]).toEqual([2, true, false, true, 20]);
    s = play(s, ['check']);
    const flop = getLegalActions(s)!;
    expect([flop.player, flop.check, flop.bet, flop.raise, flop.minRaiseTo]).toEqual([1, true, true, false, 10]);
  });

  it('is null when the hand is over', () => {
    const s = play(startHand(three(), seededRng(1)), ['fold'], ['fold']);
    expect(getLegalActions(s)).toBeNull();
  });
});

describe('a full multiway hand to showdown', () => {
  it('plays preflop → river, auto-advancing streets, and records history', () => {
    let s = rigged(three(), ['As Ah', 'Kd Kc', '7h 2c'], 'Ks 8d 3c 9h 2s');
    s = play(s, ['call'], ['call'], ['check']);
    expect(s.street).toBe('flop');
    expect(s.board.map(cardToString)).toEqual(['Ks', '8d', '3c']);
    expect(s.pot).toBe(30);
    expect(s.toAct).toBe(1);
    expect(getLegalActions(s)!.call).toBe(false);
    s = play(s, ['check'], ['check'], ['bet', 20], ['call'], ['fold']);
    expect(s.street).toBe('turn');
    expect(s.board).toHaveLength(4);
    expect(s.pot).toBe(70);
    s = play(s, ['check'], ['check']);
    expect(s.street).toBe('river');
    s = play(s, ['check'], ['check']);
    expect(isHandOver(s)).toBe(true);

    const r = getResult(s)!;
    expect(r.endedBy).toBe('showdown');
    expect(r.board.map(cardToString)).toEqual(['Ks', '8d', '3c', '9h', '2s']);
    expect(r.pots).toEqual([{ amount: 70, eligible: [0, 1], winners: [1], shares: [70] }]);
    expect(s.players.map((p) => p.stack)).toEqual([970, 1040, 990]);
    expect(r.netChange).toEqual([-30, 40, -10]);
    expect(r.showdownHands.map((h) => h.player).sort()).toEqual([0, 1]);
    assertConsistent(s, total3);

    const bet = s.history.find((h) => h.type === 'bet')!;
    expect(bet).toMatchObject({
      player: 0, street: 'flop', amount: 20, toAmount: 20, potBefore: 30, potAfter: 50, stackBefore: 990, stackAfter: 970,
    });
    expect(s.history.map((h) => h.seq)).toEqual(s.history.map((_, i) => i));
  });

  it('a player cannot win with the worst hand: folded players never win even with the best cards', () => {
    let s = rigged(three(), ['7h 2c', 'Kd Qc', 'As Ah'], '3s 8d 9c Jh 4s');
    s = play(s, ['raise', 30], ['call'], ['fold']); // BB with the aces folds
    s = play(s, ['check'], ['check'], ['check'], ['check'], ['check'], ['check']);
    const r = getResult(s)!;
    expect(r.pots[0]!.eligible).toEqual([0, 1]);
    expect(r.pots[0]!.winners).toEqual([1]); // K-Q beats 7-2; the folded aces cannot win
    expect(s.players[2]!.stack).toBe(990);
    assertConsistent(s, total3);
  });

  it('ends immediately when everyone folds to one player', () => {
    let s = startHand(three(), seededRng(5));
    s = play(s, ['raise', 40], ['fold'], ['fold']);
    expect(isHandOver(s)).toBe(true);
    expect(s.street).toBe('preflop');
    expect(s.players.map((p) => p.stack)).toEqual([1015, 995, 990]);
    expect(getResult(s)!.showdownHands).toEqual([]);
    assertConsistent(s, total3);
  });
});

describe('showdown: ties and the board', () => {
  it('splits a pot when the board plays, giving the odd chip to the first player left of the button', () => {
    let s = rigged(three(), ['2c 3c', '9d 9h', '4d 5d'], 'Th Jh Qh Kh Ah');
    s = play(s, ['call'], ['fold'], ['check']); // pot = 10 + 5(dead SB) + 10 = 25
    s = play(s, ['check'], ['check'], ['check'], ['check'], ['check'], ['check']);
    const r = getResult(s)!;
    expect(r.pots).toEqual([{ amount: 25, eligible: [0, 2], winners: [2, 0], shares: [13, 12] }]);
    expect(s.players.map((p) => p.stack)).toEqual([1002, 995, 1003]);
    assertConsistent(s, total3);
  });

  it('three-way tie on the board splits evenly', () => {
    let s = rigged(three(), ['2c 3c', '2d 3d', '2s 3s'], 'Th Jh Qh Kh Ah');
    s = play(s, ['call'], ['call'], ['check']);
    s = play(s, ['check'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check']);
    expect(s.players.map((p) => p.stack)).toEqual([1000, 1000, 1000]);
  });

  it('kicker decides between equal pairs', () => {
    let s = rigged(newGame([1000, 1000]), ['Ac Qd', 'As Jd'], 'Ah 7c 4d 2s 9h');
    s = play(s, ['call'], ['check']);
    s = play(s, ['check'], ['check'], ['check'], ['check'], ['check'], ['check']);
    expect(getResult(s)!.pots[0]!.winners).toEqual([0]);
  });
});

describe('betting rules', () => {
  it('enforces the minimum raise and tracks the raise size', () => {
    let s = startHand(three(), seededRng(1));
    expect(() => applyAction(s, { type: 'raise', amount: 15 })).toThrow(/minimum/i);
    s = play(s, ['raise', 30]); // +20
    expect(getLegalActions(s)!.minRaiseTo).toBe(50);
    s = play(s, ['raise', 50]); // +20 (re-raise)
    expect(getLegalActions(s)!.minRaiseTo).toBe(70);
    s = play(s, ['raise', 70]); // +20
    // action reopened for the original raiser
    const l = getLegalActions(s)!;
    expect([l.player, l.toCall, l.raise, l.minRaiseTo]).toEqual([0, 40, true, 90]);
  });

  it('a bigger raise raises the minimum for the next one', () => {
    let s = startHand(three(), seededRng(1));
    s = play(s, ['raise', 40]); // +30
    expect(getLegalActions(s)!.minRaiseTo).toBe(70);
    expect(() => applyAction(s, { type: 'raise', amount: 69 })).toThrow();
    expect(() => applyAction(s, { type: 'raise', amount: 70 })).not.toThrow();
  });

  it('enforces the minimum bet (one big blind) postflop but allows a short all-in bet', () => {
    let s = startHand(newGame([1000, 1000]), seededRng(1));
    s = play(s, ['call'], ['check']);
    expect(() => applyAction(s, { type: 'bet', amount: 9 })).toThrow(/minimum/i);
    expect(() => applyAction(s, { type: 'raise', amount: 20 })).toThrow();
    expect(() => applyAction(s, { type: 'bet', amount: 10 })).not.toThrow();
    expect(() => applyAction(s, { type: 'bet', amount: 5000 })).toThrow(/stack/i);
    expect(() => applyAction(s, { type: 'bet', amount: 12.5 })).toThrow();
  });

  it('a call plays the exact amount and all-in uses the whole stack', () => {
    let s = startHand(three(), seededRng(1));
    s = play(s, ['raise', 100], ['call']);
    expect(s.players[1]!.bet).toBe(100);
    expect(s.players[1]!.stack).toBe(900);
    s = play(s, ['allin']);
    expect(s.players[2]!.status).toBe('allin');
    expect(s.players[2]!.stack).toBe(0);
    expect(s.currentBet).toBe(1000);
  });

  it('a full re-raise all-in reopens the action; a short all-in does not', () => {
    // Full: BB all-in to 60 over a raise to 30 (increment 30 >= 20)
    let full = startHand(newGame([1000, 1000, 60]), seededRng(1));
    full = play(full, ['raise', 30], ['call'], ['allin']);
    let l = getLegalActions(full)!;
    expect([l.player, l.raise, l.allIn, l.minRaiseTo]).toEqual([0, true, true, 90]);

    // Short: BB all-in to 45 over a raise to 30 (increment 15 < 20)
    let short = startHand(newGame([1000, 1000, 45]), seededRng(1));
    short = play(short, ['raise', 30], ['call'], ['allin']);
    l = getLegalActions(short)!;
    expect([l.player, l.toCall, l.call, l.raise, l.allIn, l.minRaiseTo]).toEqual([0, 15, true, false, false, null]);
    expect(() => applyAction(short, { type: 'raise', amount: 200 })).toThrow(/reopened/i);
    expect(() => applyAction(short, { type: 'allin' })).toThrow();
    short = play(short, ['call']); // P0 calls 15 more
    l = getLegalActions(short)!;
    expect([l.player, l.raise]).toEqual([1, false]); // P1 also faces only a short all-in
    short = play(short, ['call']);
    expect(short.street).toBe('flop');
  });

  it('a short all-in still lets players who have not acted raise, with the old minimum', () => {
    let s = startHand(newGame([15, 1000, 1000]), seededRng(1));
    s = play(s, ['allin']); // 15 total: only +5 over the BB (short)
    expect(s.currentBet).toBe(15);
    const l = getLegalActions(s)!;
    expect([l.player, l.toCall, l.raise, l.minRaiseTo]).toEqual([1, 10, true, 25]);
  });
});

describe('illegal actions', () => {
  it('cannot check facing a bet', () => {
    const s = startHand(three(), seededRng(1));
    expect(() => applyAction(s, { type: 'check' })).toThrow(IllegalActionError);
    expect(() => applyAction(s, { type: 'check' })).toThrow(/Cannot check/);
  });

  it('cannot call when nothing is owed', () => {
    let s = startHand(newGame([1000, 1000]), seededRng(1));
    s = play(s, ['call']);
    expect(() => applyAction(s, { type: 'call' })).toThrow(/nothing to call/);
  });

  it('cannot act out of turn', () => {
    const s = startHand(three(), seededRng(1));
    expect(() => applyAction(s, { type: 'fold' }, 2)).toThrow(/turn/);
    expect(() => applyAction(s, { type: 'fold' }, 9)).toThrow();
  });

  it('folded and all-in players cannot act', () => {
    let s = startHand(newGame([100, 1000, 1000]), seededRng(1));
    s = play(s, ['allin'], ['call'], ['call']); // flop
    expect(() => applyAction(s, { type: 'check' }, 0)).toThrow(/All-in/);
    let f = startHand(three(), seededRng(1));
    f = play(f, ['fold']);
    expect(() => applyAction(f, { type: 'check' }, 0)).toThrow(/Folded/);
  });

  it('cannot bet when a bet exists or raise when none exists', () => {
    const s = startHand(three(), seededRng(1));
    expect(() => applyAction(s, { type: 'bet', amount: 30 })).toThrow(/use raise/);
    let f = play(startHand(newGame([1000, 1000]), seededRng(1)), ['call'], ['check']);
    expect(() => applyAction(f, { type: 'raise', amount: 30 })).toThrow();
    f = play(f, ['check']);
    expect(f.street).toBe('flop');
  });

  it('cannot act once the hand is over', () => {
    const s = play(startHand(three(), seededRng(1)), ['fold'], ['fold']);
    expect(() => applyAction(s, { type: 'fold' })).toThrow();
  });

  it('a failed action leaves the state untouched', () => {
    const s = startHand(three(), seededRng(1));
    const snap = structuredClone(s);
    expect(() => applyAction(s, { type: 'raise', amount: 11 })).toThrow();
    expect(s).toEqual(snap);
  });
});

describe('all-ins and side pots', () => {
  it('builds main pot, side pot and refund for 200 / 500 / 1000 stacks', () => {
    let s = rigged(newGame([200, 500, 1000]), ['As Ah', 'Kd Kc', 'Qd Qc'], '2h 7d 9s Jc 3d');
    s = play(s, ['allin'], ['allin'], ['allin']);
    expect(isHandOver(s)).toBe(true);
    expect(s.board).toHaveLength(5); // board ran out automatically
    const r = getResult(s)!;
    expect(r.pots).toEqual([
      { amount: 600, eligible: [0, 1, 2], winners: [0], shares: [600] },
      { amount: 600, eligible: [1, 2], winners: [1], shares: [600] },
    ]);
    expect(r.refunds).toEqual([{ player: 2, amount: 500 }]);
    expect(r.payouts).toEqual([600, 600, 500]);
    expect(r.netChange).toEqual([400, 100, -500]);
    expect(s.players.map((p) => p.stack)).toEqual([600, 600, 500]);
    assertConsistent(s, 1700);
  });

  it('builds several side pots with four all-ins and awards each to its best eligible hand', () => {
    let s = rigged(newGame([100, 200, 300, 1000]), ['As Ah', 'Kd Kc', 'Qd Qc', 'Jd Jh'], '2h 7d 9s 4c 3d');
    s = play(s, ['allin'], ['allin'], ['allin'], ['allin']);
    const r = getResult(s)!;
    expect(r.pots.map((p) => [p.amount, p.eligible, p.winners])).toEqual([
      [400, [0, 1, 2, 3], [0]],
      [300, [1, 2, 3], [1]],
      [200, [2, 3], [2]],
    ]);
    expect(r.refunds).toEqual([{ player: 3, amount: 700 }]);
    expect(s.players.map((p) => p.stack)).toEqual([400, 300, 200, 700]);
    assertConsistent(s, 1600);
  });

  it('short stack wins only the main pot even with the best hand; side pot goes to the next best', () => {
    let s = rigged(newGame([50, 500, 500]), ['As Ah', '9d 9c', 'Kd Kc'], '2h 7s 4d Jc 3d');
    s = play(s, ['allin'], ['raise', 200], ['call']);
    s = play(s, ['check'], ['check'], ['check'], ['check'], ['check'], ['check']);
    const r = getResult(s)!;
    expect(r.pots[0]).toMatchObject({ amount: 150, winners: [0] });
    expect(r.pots[1]).toMatchObject({ amount: 300, eligible: [1, 2], winners: [2] });
    assertConsistent(s, 1050);
  });

  it('a call for less than the bet is an all-in call and the excess is refunded', () => {
    let s = rigged(newGame([1000, 300]), ['As Ah', 'Kd Kc'], '2h 7d 9s Jc 3d');
    s = play(s, ['raise', 500], ['call']);
    expect(s.players[1]!.status).toBe('allin');
    expect(s.players[1]!.totalContribution).toBe(300);
    expect(isHandOver(s)).toBe(true);
    const r = getResult(s)!;
    expect(r.refunds).toEqual([{ player: 0, amount: 200 }]);
    expect(r.pots).toEqual([{ amount: 600, eligible: [0, 1], winners: [0], shares: [600] }]);
    expect(s.players.map((p) => p.stack)).toEqual([1300, 0]);
    assertConsistent(s, 1300);
  });

  it('lets only the remaining player with chips fold or call against an all-in, then runs out the board', () => {
    let s = startHand(newGame([100, 1000, 1000]), seededRng(4));
    s = play(s, ['allin'], ['call'], ['fold']);
    expect(isHandOver(s)).toBe(true);
    expect(s.board).toHaveLength(5);
    assertConsistent(s, 2100);
  });

  it('keeps betting between the two players who still have chips when a third is all-in', () => {
    let s = startHand(newGame([100, 1000, 1000]), seededRng(4));
    s = play(s, ['allin'], ['call'], ['call']);
    expect(s.street).toBe('flop');
    expect(s.toAct).toBe(1);
    s = play(s, ['bet', 50]);
    expect(s.toAct).toBe(2);
    s = play(s, ['call']);
    expect(s.street).toBe('turn');
    s = play(s, ['check'], ['check'], ['check'], ['check']);
    expect(isHandOver(s)).toBe(true);
    assertConsistent(s, 2100);
  });

  it('a short big blind posted all-in leaves the price to play at a full big blind', () => {
    const s = startHand(newGame([1000, 1000, 6]), seededRng(1));
    expect(s.players[2]!.status).toBe('allin');
    expect(s.players[2]!.bet).toBe(6);
    expect(getLegalActions(s)!.callAmount).toBe(10);
    assertConsistent(s, 2006);
  });

  it('betting continues between the other players when the big blind is all-in from the post', () => {
    let s = startHand(newGame([1000, 1000, 6]), seededRng(1));
    s = play(s, ['call'], ['call']);
    expect(s.street).toBe('flop');
    expect(s.toAct).toBe(1);
    s = play(s, ['check'], ['check'], ['check'], ['check'], ['check'], ['check']);
    expect(isHandOver(s)).toBe(true);
    // the BB (6 chips) can only win a main pot of 18 even with the best hand
    expect(getResult(s)!.pots[0]!.amount).toBe(18);
    assertConsistent(s, 2006);
  });
});
