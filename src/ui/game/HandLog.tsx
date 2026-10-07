import type { ActionRecord, Card, GameState, Street } from '../../engine';
import { MiniCard } from '../cards/MiniCard';
import { useFormat, type Formatter } from '../format';
import { buildResultView } from './views';

const STREET_LABEL: Record<Street, string> = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };

/** One line of the hand history, e.g. "raises to 6 BB". */
export function describeAction(r: ActionRecord, f: Formatter): string {
  const to = f.full(r.toAmount);
  switch (r.type) {
    case 'postSmallBlind':
      return `posts small blind ${f.full(r.amount)}`;
    case 'postBigBlind':
      return `posts big blind ${f.full(r.amount)}`;
    case 'fold':
      return 'folds';
    case 'check':
      return 'checks';
    case 'call':
      return `calls ${f.full(r.amount)}${r.allIn ? ' (all-in)' : ''}`;
    case 'bet':
      return `bets ${to}${r.allIn ? ' (all-in)' : ''}`;
    case 'raise':
      return `raises to ${to}${r.allIn ? ' (all-in)' : ''}`;
    case 'allin':
      return `goes all-in for ${to}`;
  }
}

function streetCards(board: Card[], street: Street): Card[] {
  if (street === 'flop') return board.slice(0, 3);
  if (street === 'turn') return board.slice(3, 4);
  if (street === 'river') return board.slice(4, 5);
  return [];
}

export function HandLog({ game }: { game: GameState }) {
  const f = useFormat();
  const streets: Street[] = [];
  for (const h of game.history) if (!streets.includes(h.street)) streets.push(h.street);
  const result = game.handStatus === 'complete' ? buildResultView(game) : null;

  return (
    <div className="handlog" aria-label={`Hand ${game.handNumber} log`}>
      {streets.map((street) => (
        <section key={street} className="handlog__street">
          <h3 className="handlog__head">
            <span className="label">{STREET_LABEL[street]}</span>
            <span className="handlog__cards">
              {streetCards(game.board, street).map((c) => (
                <MiniCard key={`${c.rank}${c.suit}`} card={c} />
              ))}
            </span>
          </h3>
          <ol>
            {game.history
              .filter((h) => h.street === street)
              .map((h) => (
                <li key={h.seq} data-type={h.type}>
                  <span className="handlog__who">{h.player === 0 ? game.players[0]?.name : (game.players[h.player]?.name ?? '?')}</span>
                  <span>{describeAction(h, f)}</span>
                  <span className="handlog__pot num">{f.fmt(h.potAfter)}</span>
                </li>
              ))}
          </ol>
        </section>
      ))}
      {result && (
        <section className="handlog__street handlog__result">
          <h3 className="handlog__head">
            <span className="label">Result</span>
          </h3>
          <ol>
            {result.pots.map((p) => (
              <li key={p.label}>
                <span className="handlog__who">{p.winners.join(' & ')}</span>
                <span>
                  {p.split ? 'split' : 'wins'} {p.label.toLowerCase()} {f.full(p.amount)}
                </span>
                <span />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
