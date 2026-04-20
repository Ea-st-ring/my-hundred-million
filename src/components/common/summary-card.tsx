import { formatKrw } from "@/lib/format";

type SummaryCardProps = {
	label: string;
	value: number;
};

export function SummaryCard({ label, value }: SummaryCardProps) {
	return (
		<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
			<p className="text-xs text-slate-500">{label}</p>
			<p className="mt-1 text-base font-semibold">{formatKrw(value)}</p>
		</div>
	);
}
