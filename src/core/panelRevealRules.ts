/**
 * Pure rules for whether Veil may reveal a tray item (click or hover expand).
 * Keeps behavior aligned between animation and instant paths.
 */
export function shouldOfferRevealForItem(
	item: { name: string; originalVisible?: boolean },
	visibleItemNames: readonly string[],
): boolean {
	if (item.originalVisible === false) {
		return false;
	}
	const userWantsVisible = visibleItemNames.includes(item.name);
	const wasVisibleAtDetection =
		item.originalVisible === true || item.originalVisible === undefined;
	return userWantsVisible || wasVisibleAtDetection;
}
