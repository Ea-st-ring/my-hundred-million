type DashboardStatCardProps = {
	title: string;
	value: string;
	emphasis?: "default" | "positive" | "negative";
	delta?: string | null;
	deltaEmphasis?: "default" | "positive" | "negative";
};

export function DashboardStatCard({
	title,
	value,
	emphasis = "default",
	delta = null,
	deltaEmphasis = "default",
}: DashboardStatCardProps) {
	const valueClassName =
		emphasis === "positive"
			? "text-emerald-600"
			: emphasis === "negative"
				? "text-rose-600"
				: "text-slate-900";
	const deltaClassName =
		deltaEmphasis === "positive"
			? "text-emerald-600"
			: deltaEmphasis === "negative"
				? "text-rose-600"
				: "text-slate-500";
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
			<div className="mt-2 flex flex-wrap items-end gap-2">
				<p className={`text-2xl font-semibold ${valueClassName}`}>{value}</p>
				{delta !== null ? (
					<p className={`pb-1 text-sm font-semibold ${deltaClassName}`}>
						{delta}
					</p>
				) : null}
			</div>
		</div>
	);
}
