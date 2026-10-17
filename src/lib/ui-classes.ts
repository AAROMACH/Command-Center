/**
 * Older call sites pass `uppercase`, wide tracking, black weight and
 * 6–11px text to shared controls. The UI plan makes controls sentence case
 * at a legible size, so the shared components drop those classes here
 * instead of every caller being edited.
 */
const SHOUTY = /^!?(uppercase|tracking-(wide|wider|widest|tighter|tight|\[[\d.]+em\])|text-\[(6|7|8|9|10|11)px\]|font-black)$/;

export function calmClasses(className?: string): string | undefined {
    if (!className) return className;
    return className.split(/\s+/).filter(c => !SHOUTY.test(c.split(':').pop() || c)).join(' ');
}

/** Table headers: one look everywhere — callers keep alignment/width only. */
const HEAD_TYPE = /^!?(uppercase|normal-case|tracking-\S+|text-\[\d+px\]|text-(xs|sm|base)|font-(black|bold|semibold|medium|normal))$/;
export function tableHeadClasses(className?: string): string | undefined {
    if (!className) return className;
    return className.split(/\s+/).filter(c => !HEAD_TYPE.test(c)).join(' ');
}
