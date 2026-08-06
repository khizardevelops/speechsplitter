/**
 * Example text for the input box, per language.
 *
 * Kept in the app rather than the pack because it is interface copy, not
 * linguistic data: it has to read naturally to a beginner, and it should not
 * require a pack download to appear.
 */

// Each is the same thought as the English example, so the adverbial clause a
// reader may already have seen parsed ("When the weather is nice…") recurs in
// the language they switch to.
const EXAMPLES: Record<string, string> = {
	en: 'When the weather is nice, we sit outside and watch the birds.',
	ru: 'Погода сегодня хорошая, и мы сидим на улице.',
	fa: 'وقتی که هوا خوب است، بیرون می‌نشینیم و پرندگان را تماشا می‌کنیم.',
	fr: 'Quand il fait beau, nous nous asseyons dehors et regardons les oiseaux.',
	de: 'Wenn das Wetter schön ist, sitzen wir draußen und beobachten die Vögel.',
	ps: 'کله چې هوا ښه وي، موږ بهر کښېنو او مرغان ګورو۔'
};

export function placeholderFor(code: string): string {
	return EXAMPLES[code] ?? 'Enter text to analyse.';
}
