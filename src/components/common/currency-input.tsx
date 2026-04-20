import { formatNumber, parseIntegerInput } from "@/lib/format";

type CurrencyInputProps = {
	value: number;
	onChange: (value: number) => void;
};

export function CurrencyInput({ value, onChange }: CurrencyInputProps) {
	return (
		<input
			inputMode="numeric"
			className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
			value={value === 0 ? "" : formatNumber(value)}
			onChange={(event) => onChange(parseIntegerInput(event.target.value))}
			placeholder="0"
		/>
	);
}
