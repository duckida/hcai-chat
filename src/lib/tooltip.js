/**
 * How long the pointer has to rest before a tooltip appears.
 *
 * The controls that carry these live in a header the cursor sweeps across on
 * its way to the composer. An instant tooltip puts a panel over the
 * conversation you came to read, so waiting means one only appears for someone
 * who deliberately stopped on the control, and brushing past costs nothing.
 */
export const TOOLTIP_OPEN_DELAY = 450;
