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
