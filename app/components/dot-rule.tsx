/**
 * The page's signature rule: a 1px dashed line with a 6px dot at each end.
 * Used exactly twice — under the header and above the footer — as a
 * matched pair of bookends. Don't reach for it between race groups.
 */
export function DotRule() {
  return (
    <div aria-hidden className="flex items-center">
      <span className="size-1.5 shrink-0 rounded-full bg-zinc-400" />
      <span className="flex-1 border-t border-dashed border-zinc-400" />
      <span className="size-1.5 shrink-0 rounded-full bg-zinc-400" />
    </div>
  );
}
